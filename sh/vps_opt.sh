#!/usr/bin/env bash

# VPN retransmission diagnostics and conservative network tuning.
# Supported: Ubuntu/Debian with Bash 4+, iproute2, and procps sysctl.

set -u
set -o pipefail

VERSION="2026.3"
CONF="/etc/sysctl.d/99-vps-network-optimization.conf"
BACKUP_DIR="/root/sysctl-backup"
BBR_MODULE_CONF="/etc/modules-load.d/vps-opt-tcp-bbr.conf"
LOCK_FILE="/run/lock/vps-network-optimization.lock"

MODE="diagnose"
PROFILE="conservative"
ENABLE_MTU_PROBING=0
ASSUME_YES=0
WATCH_SECONDS=0
DEFAULT_IFACE=""
BBR_AVAILABLE=0
FQ_AVAILABLE=0
RUN_ID=""
MANIFEST=""
RUNTIME_BACKUP=""
APPLY_LOG=""
ROLLBACK_MANIFEST=""
ROLLBACK_RUNTIME_BACKUP=""

info() {
    printf '[INFO] %s\n' "$1"
}

success() {
    printf '[ OK ] %s\n' "$1"
}

warning() {
    printf '[WARN] %s\n' "$1" >&2
}

error() {
    printf '[ERR ] %s\n' "$1" >&2
}

section() {
    printf '\n============================================================\n'
    printf ' %s\n' "$1"
    printf '============================================================\n'
}

usage() {
    cat <<'EOF'
Usage:
  bash vps_opt.sh --diagnose [--watch SECONDS] [--interface IFACE]
  sudo bash vps_opt.sh --apply --yes [--profile PROFILE] [--enable-mtu-probing]
  sudo bash vps_opt.sh --rollback --yes

Modes:
  --diagnose                 Read-only retransmission and host-drop diagnostics.
  --watch SECONDS            Measure nstat TCP counter deltas over 1-3600 seconds.
  --apply                    Apply this script's generated sysctl file.
  --rollback                 Restore the latest configuration and runtime snapshot.

Options:
  --profile PROFILE          conservative (16 MiB), balanced (32 MiB), or
                             high-throughput (64 MiB). Default: conservative.
  --enable-mtu-probing       Persist tcp_mtu_probing = 1. Use only when
                             diagnostics indicate a path-MTU black-hole.
  --interface IFACE          Interface used for diagnostics. Defaults to the
                             device in the first default route.
  --yes                      Skip the interactive confirmation for apply/rollback.
  -h, --help                 Show this help.

Notes:
  - No MTU, MSS, offload, tcp_retries2, TCP Fast Open, or keepalive settings
    are changed by this script.
  - BBR and FQ are written only when the running kernel supports them.
  - Hysteria 2 uses QUIC/UDP. Its loss recovery is not included in TCP
    retransmission counters; inspect its own logs and UDP/socket drops too.
EOF
}

die() {
    error "$1"
    exit 1
}

require_root() {
    [[ "$(id -u)" -eq 0 ]] || die "Run this mode as root."
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || die "Required command is unavailable: $1"
}

is_integer_in_range() {
    local value="$1"
    local minimum="$2"
    local maximum="$3"

    [[ "$value" =~ ^[0-9]+$ ]] && (( value >= minimum && value <= maximum ))
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --diagnose)
                MODE="diagnose"
                ;;
            --apply)
                MODE="apply"
                ;;
            --rollback)
                MODE="rollback"
                ;;
            --profile)
                [[ $# -ge 2 ]] || die "--profile requires a value."
                PROFILE="$2"
                shift
                ;;
            --enable-mtu-probing)
                ENABLE_MTU_PROBING=1
                ;;
            --interface)
                [[ $# -ge 2 ]] || die "--interface requires a value."
                DEFAULT_IFACE="$2"
                shift
                ;;
            --watch)
                [[ $# -ge 2 ]] || die "--watch requires a value in seconds."
                WATCH_SECONDS="$2"
                shift
                ;;
            --yes)
                ASSUME_YES=1
                ;;
            -h|--help)
                MODE="help"
                ;;
            *)
                die "Unknown option: $1"
                ;;
        esac
        shift
    done

    if [[ "$MODE" != "diagnose" && "$WATCH_SECONDS" != "0" ]]; then
        die "--watch is available only with --diagnose."
    fi

    if [[ "$MODE" == "diagnose" ]] && ! is_integer_in_range "$WATCH_SECONDS" 0 3600; then
        die "--watch must be an integer from 0 to 3600."
    fi
}

profile_buffer_max() {
    case "$1" in
        conservative)
            printf '%s\n' "16777216"
            ;;
        balanced)
            printf '%s\n' "33554432"
            ;;
        high-throughput)
            printf '%s\n' "67108864"
            ;;
        *)
            return 1
            ;;
    esac
}

extract_default_iface() {
    awk '
        $1 == "default" {
            for (i = 1; i < NF; i++) {
                if ($i == "dev") {
                    print $(i + 1)
                    exit
                }
            }
        }
    '
}

detect_default_iface() {
    if [[ -n "$DEFAULT_IFACE" ]]; then
        return 0
    fi

    if ! command -v ip >/dev/null 2>&1; then
        return 1
    fi

    DEFAULT_IFACE="$(
        ip route show default 2>/dev/null | extract_default_iface
    )"

    [[ -n "$DEFAULT_IFACE" ]]
}

kernel_has_bbr() {
    sysctl -n net.ipv4.tcp_available_congestion_control 2>/dev/null |
        tr ' ' '\n' |
        grep -qx "bbr"
}

detect_bbr() {
    local allow_load="$1"

    BBR_AVAILABLE=0
    if kernel_has_bbr; then
        BBR_AVAILABLE=1
        return 0
    fi

    if [[ "$allow_load" -eq 1 ]] && command -v modprobe >/dev/null 2>&1; then
        modprobe tcp_bbr >/dev/null 2>&1 || true
        if kernel_has_bbr; then
            BBR_AVAILABLE=1
            return 0
        fi
    fi

    return 1
}

detect_fq() {
    local allow_load="$1"

    FQ_AVAILABLE=0
    if [[ -d /sys/module/sch_fq ]]; then
        FQ_AVAILABLE=1
        return 0
    fi

    if [[ "$allow_load" -eq 1 ]] && command -v modprobe >/dev/null 2>&1; then
        modprobe sch_fq >/dev/null 2>&1 || true
        if [[ -d /sys/module/sch_fq ]]; then
            FQ_AVAILABLE=1
            return 0
        fi
    fi

    return 1
}

bbr_is_loadable_module() {
    local module_path

    command -v modinfo >/dev/null 2>&1 || return 1
    module_path="$(modinfo -F filename tcp_bbr 2>/dev/null || true)"
    [[ -n "$module_path" && "$module_path" != "(builtin)" ]]
}

render_sysctl_config() {
    local bbr_available="$1"
    local fq_available="$2"
    local profile="$3"
    local enable_mtu_probing="$4"
    local buffer_max

    buffer_max="$(profile_buffer_max "$profile")" || return 1

    printf '# Managed by vps_opt.sh v%s\n' "$VERSION"
    printf '# Profile: %s\n' "$profile"
    printf '# This file intentionally does not change MTU, MSS, offload,\n'
    printf '# tcp_retries2, TCP Fast Open, or TCP keepalive.\n\n'

    if [[ "$bbr_available" -eq 1 ]]; then
        printf 'net.ipv4.tcp_congestion_control = bbr\n\n'
    fi

    if [[ "$fq_available" -eq 1 ]]; then
        printf 'net.core.default_qdisc = fq\n\n'
    fi

    printf '# TCP autotuning caps and socket buffer caps.\n'
    printf 'net.ipv4.tcp_rmem = 4096 87380 %s\n' "$buffer_max"
    printf 'net.ipv4.tcp_wmem = 4096 65536 %s\n' "$buffer_max"
    printf 'net.core.rmem_max = %s\n' "$buffer_max"
    printf 'net.core.wmem_max = %s\n' "$buffer_max"

    if [[ "$enable_mtu_probing" -eq 1 ]]; then
        printf '\n# Enable only after evidence of path-MTU black holes.\n'
        printf 'net.ipv4.tcp_mtu_probing = 1\n'
    fi
}

config_keys() {
    awk -F= '
        /^[[:space:]]*[a-z0-9_.]+[[:space:]]*=/ {
            key = $1
            gsub(/[[:space:]]/, "", key)
            print key
        }
    ' "$1"
}

print_system_info() {
    section "System"
    if [[ -r /etc/os-release ]]; then
        . /etc/os-release
        printf 'OS: %s\n' "${PRETTY_NAME:-unknown}"
    fi
    printf 'Kernel: %s\n' "$(uname -r)"
    printf 'Architecture: %s\n' "$(uname -m)"
    printf 'Uptime: %s\n' "$(uptime -p 2>/dev/null || uptime)"
}

print_capabilities() {
    section "Kernel capability"

    if detect_bbr 0; then
        success "BBR is available."
    else
        warning "BBR is unavailable in the running kernel."
    fi

    if detect_fq 0; then
        success "sch_fq is available."
    else
        warning "sch_fq is unavailable in the running kernel."
    fi

    printf 'Available congestion controls: '
    sysctl -n net.ipv4.tcp_available_congestion_control 2>/dev/null || printf 'unknown\n'
}

print_interface_diagnostics() {
    section "Interface and qdisc"

    if ! detect_default_iface; then
        warning "No default-route interface was detected."
        return 0
    fi

    printf 'Interface: %s\n\n' "$DEFAULT_IFACE"
    ip -brief address show "$DEFAULT_IFACE" 2>/dev/null || true
    printf '\n'
    ip -s link show dev "$DEFAULT_IFACE" 2>/dev/null || true

    if command -v tc >/dev/null 2>&1; then
        printf '\nActual qdisc:\n'
        tc qdisc show dev "$DEFAULT_IFACE" 2>/dev/null || true
        printf '\nQdisc statistics:\n'
        tc -s qdisc show dev "$DEFAULT_IFACE" 2>/dev/null || true
    else
        warning "tc is unavailable; qdisc drops cannot be inspected."
    fi
}

print_softnet_diagnostics() {
    local line
    local processed_hex
    local dropped_hex
    local squeezed_hex
    local processed=0
    local dropped=0
    local squeezed=0

    [[ -r /proc/net/softnet_stat ]] || return 0

    while IFS= read -r line; do
        read -r processed_hex dropped_hex squeezed_hex _ <<< "$line"
        processed=$((processed + 16#$processed_hex))
        dropped=$((dropped + 16#$dropped_hex))
        squeezed=$((squeezed + 16#$squeezed_hex))
    done < /proc/net/softnet_stat

    printf 'softnet processed: %s\n' "$processed"
    printf 'softnet dropped:   %s\n' "$dropped"
    printf 'softnet squeezed:  %s\n' "$squeezed"
    if (( dropped > 0 || squeezed > 0 )); then
        warning "Non-zero softnet counters warrant CPU/RX queue investigation."
    fi
}

NSTAT_COUNTERS=(
    "TcpRetransSegs"
    "TcpExtTCPTimeouts"
    "TcpExtTCPFastRetrans"
    "TcpExtTCPLossProbes"
)

nstat_value() {
    local counter="$1"

    nstat -a -s -z "$counter" 2>/dev/null |
        awk -v counter="$counter" '$1 == counter { print $2; exit }'
}

print_nstat_counters() {
    local counter
    local value

    if ! command -v nstat >/dev/null 2>&1; then
        warning "nstat is unavailable; TCP retransmission counters are skipped."
        return 0
    fi

    for counter in "${NSTAT_COUNTERS[@]}"; do
        value="$(nstat_value "$counter")"
        printf '%-26s %s\n' "$counter" "${value:-unsupported}"
    done
}

print_nstat_delta() {
    local -a before=()
    local -a after=()
    local counter
    local index
    local value

    if ! command -v nstat >/dev/null 2>&1; then
        warning "nstat is unavailable; counter delta is skipped."
        return 0
    fi

    for counter in "${NSTAT_COUNTERS[@]}"; do
        before+=("$(nstat_value "$counter")")
    done

    info "Collecting a ${WATCH_SECONDS}s TCP counter interval..."
    sleep "$WATCH_SECONDS"

    for counter in "${NSTAT_COUNTERS[@]}"; do
        after+=("$(nstat_value "$counter")")
    done

    printf '\nTCP counter delta over %ss:\n' "$WATCH_SECONDS"
    for index in "${!NSTAT_COUNTERS[@]}"; do
        value=0
        if [[ "${before[$index]:-}" =~ ^[0-9]+$ && "${after[$index]:-}" =~ ^[0-9]+$ ]]; then
            value=$((after[index] - before[index]))
        fi
        printf '%-26s %s\n' "${NSTAT_COUNTERS[$index]}" "$value"
    done
}

print_tcp_diagnostics() {
    section "TCP retransmission diagnostics"

    if command -v ss >/dev/null 2>&1; then
        printf 'TCP summary:\n'
        ss -s 2>/dev/null || true
        printf '\nEstablished TCP sockets (including retrans/RTT when available):\n'
        ss -tin state established 2>/dev/null | sed -n '1,160p' || true
    else
        warning "ss is unavailable; per-connection TCP diagnostics are skipped."
    fi

    printf '\nKernel TCP counters since boot:\n'
    print_nstat_counters

    if (( WATCH_SECONDS > 0 )); then
        print_nstat_delta
    fi
}

print_udp_diagnostics() {
    section "UDP and QUIC reminder"
    printf 'UDP summary:\n'
    if command -v ss >/dev/null 2>&1; then
        ss -u -s 2>/dev/null || true
    fi
    printf '\n'
    info "Hysteria 2 retransmission is QUIC/UDP loss recovery, not TcpRetransSegs."
    info "Correlate Hysteria logs with interface/qdisc drops and UDP socket pressure."
}

run_diagnose() {
    require_command sysctl
    require_command ip

    print_system_info
    print_capabilities
    print_interface_diagnostics

    section "Kernel receive-path summary"
    print_softnet_diagnostics

    print_tcp_diagnostics
    print_udp_diagnostics

    section "Next action"
    info "Use --watch 300 during the problem window to capture TCP counter deltas."
    info "Use --enable-mtu-probing only when symptoms and path tests indicate an MTU black hole."
}

acquire_lock() {
    command -v flock >/dev/null 2>&1 || die "flock is required for apply and rollback."
    mkdir -p "$(dirname "$LOCK_FILE")" || die "Cannot create lock directory."
    exec 9>"$LOCK_FILE"
    flock -n 9 || die "Another vps_opt.sh apply or rollback is already running."
}

confirm() {
    local action="$1"
    local answer

    if [[ "$ASSUME_YES" -eq 1 ]]; then
        return 0
    fi

    printf '%s will modify kernel networking configuration. Continue? [y/N] ' "$action"
    read -r answer
    [[ "$answer" == "y" || "$answer" == "Y" ]] || die "Cancelled."
}

initialize_transaction() {
    local state

    umask 077
    install -d -m 0700 "$BACKUP_DIR" || die "Cannot create backup directory."

    RUN_ID="$(date +%Y%m%d-%H%M%S)-$$"
    MANIFEST="$BACKUP_DIR/transaction-$RUN_ID.env"
    RUNTIME_BACKUP="$BACKUP_DIR/runtime-$RUN_ID.tsv"
    APPLY_LOG="$BACKUP_DIR/apply-$RUN_ID.log"
    : > "$MANIFEST" || die "Cannot create transaction manifest."

    if [[ -f "$CONF" ]]; then
        state="present"
        cp -p "$CONF" "$BACKUP_DIR/config-$RUN_ID.conf" ||
            die "Cannot back up the existing sysctl configuration."
        printf 'config_backup=%s\n' "$BACKUP_DIR/config-$RUN_ID.conf" >> "$MANIFEST" ||
            die "Cannot record the sysctl backup path."
    else
        state="absent"
    fi
    printf 'config_state=%s\n' "$state" >> "$MANIFEST" ||
        die "Cannot record the sysctl backup state."

    if [[ -f "$BBR_MODULE_CONF" ]]; then
        state="present"
        cp -p "$BBR_MODULE_CONF" "$BACKUP_DIR/module-$RUN_ID.conf" ||
            die "Cannot back up the existing BBR module configuration."
        printf 'module_backup=%s\n' "$BACKUP_DIR/module-$RUN_ID.conf" >> "$MANIFEST" ||
            die "Cannot record the BBR module backup path."
    else
        state="absent"
    fi
    printf 'module_state=%s\n' "$state" >> "$MANIFEST" ||
        die "Cannot record the BBR module backup state."
}

manifest_value() {
    local key="$1"
    local manifest="$2"

    awk -F= -v key="$key" '$1 == key { print substr($0, length(key) + 2); exit }' "$manifest"
}

validate_runtime_backup() {
    local runtime_backup="$1"

    [[ -s "$runtime_backup" ]] &&
        awk -F $'\t' '
            NF != 2 || $1 !~ /^[a-z0-9_.]+$/ {
                invalid = 1
            }
            END {
                exit invalid
            }
        ' "$runtime_backup"
}

validate_transaction_manifest() {
    local manifest="$1"
    local config_state
    local config_backup
    local module_state
    local module_backup
    local runtime_backup

    [[ -r "$manifest" ]] || return 1

    config_state="$(manifest_value "config_state" "$manifest")"
    module_state="$(manifest_value "module_state" "$manifest")"
    runtime_backup="$(manifest_value "runtime_backup" "$manifest")"

    case "$config_state" in
        present)
            config_backup="$(manifest_value "config_backup" "$manifest")"
            [[ -r "$config_backup" ]] || return 1
            ;;
        absent)
            ;;
        *)
            return 1
            ;;
    esac

    case "$module_state" in
        present)
            module_backup="$(manifest_value "module_backup" "$manifest")"
            [[ -r "$module_backup" ]] || return 1
            ;;
        absent)
            ;;
        *)
            return 1
            ;;
    esac

    validate_runtime_backup "$runtime_backup"
}

snapshot_runtime_values() {
    local config_file="$1"
    local key
    local value

    : > "$RUNTIME_BACKUP" || die "Cannot create runtime backup."

    while IFS= read -r key; do
        value="$(sysctl -n "$key" 2>/dev/null)" ||
            die "Cannot read current sysctl value: $key"
        printf '%s\t%s\n' "$key" "$value" >> "$RUNTIME_BACKUP" ||
            die "Cannot write the runtime backup."
    done < <(config_keys "$config_file")

    printf 'runtime_backup=%s\n' "$RUNTIME_BACKUP" >> "$MANIFEST" ||
        die "Cannot record the runtime backup path."
}

restore_runtime_values() {
    local runtime_backup="$1"
    local key
    local value
    local failed=0

    [[ -r "$runtime_backup" ]] || return 1

    while IFS=$'\t' read -r key value; do
        sysctl -w "$key=$value" >/dev/null 2>&1 || failed=1
    done < "$runtime_backup"

    return "$failed"
}

restore_managed_file() {
    local state_key="$1"
    local backup_key="$2"
    local destination="$3"
    local manifest="$4"
    local state
    local backup
    local temp_file

    state="$(manifest_value "$state_key" "$manifest")"
    backup="$(manifest_value "$backup_key" "$manifest")"

    case "$state" in
        present)
            [[ -r "$backup" ]] || return 1
            temp_file="$(mktemp "${destination}.restore.XXXXXX")" || return 1
            cp -p "$backup" "$temp_file" || {
                rm -f "$temp_file"
                return 1
            }
            chmod 0644 "$temp_file" || {
                rm -f "$temp_file"
                return 1
            }
            mv -f "$temp_file" "$destination"
            ;;
        absent)
            rm -f "$destination"
            ;;
        *)
            return 1
            ;;
    esac
}

persist_latest_transaction() {
    local pointer="$BACKUP_DIR/latest-transaction"
    local pointer_temp

    validate_transaction_manifest "$MANIFEST" || return 1

    pointer_temp="$(mktemp "$BACKUP_DIR/.latest.XXXXXX")" ||
        return 1
    if ! printf '%s\n' "$MANIFEST" > "$pointer_temp"; then
        rm -f "$pointer_temp"
        return 1
    fi
    if ! mv -f "$pointer_temp" "$pointer"; then
        rm -f "$pointer_temp"
        return 1
    fi
}

reconcile_bbr_module_config() {
    local temp_file

    if [[ "$BBR_AVAILABLE" -ne 1 ]] || ! bbr_is_loadable_module; then
        if [[ -e "$BBR_MODULE_CONF" ]] && ! rm -f "$BBR_MODULE_CONF"; then
            die "Cannot remove the stale BBR module load configuration."
        fi
        return 0
    fi

    install -d -m 0755 "$(dirname "$BBR_MODULE_CONF")" ||
        die "Cannot create modules-load directory."
    temp_file="$(mktemp "${BBR_MODULE_CONF}.tmp.XXXXXX")" ||
        die "Cannot create BBR module temporary file."
    if ! printf 'tcp_bbr\n' > "$temp_file" || ! chmod 0644 "$temp_file"; then
        rm -f "$temp_file"
        die "Cannot write the BBR module load configuration."
    fi
    if ! mv -f "$temp_file" "$BBR_MODULE_CONF"; then
        rm -f "$temp_file"
        die "Cannot persist the BBR module load configuration."
    fi
}

snapshot_rollback_state() {
    local source_runtime_backup="$1"
    local state
    local key
    local value
    local rollback_id

    validate_runtime_backup "$source_runtime_backup" ||
        die "The previous runtime backup is invalid."

    umask 077
    install -d -m 0700 "$BACKUP_DIR" ||
        die "Cannot create backup directory for rollback."

    rollback_id="rollback-$(date +%Y%m%d-%H%M%S)-$$"
    ROLLBACK_MANIFEST="$BACKUP_DIR/$rollback_id.env"
    ROLLBACK_RUNTIME_BACKUP="$BACKUP_DIR/$rollback_id-runtime.tsv"
    : > "$ROLLBACK_MANIFEST" ||
        die "Cannot create rollback compensation manifest."

    if [[ -f "$CONF" ]]; then
        state="present"
        cp -p "$CONF" "$BACKUP_DIR/$rollback_id-config.conf" ||
            die "Cannot snapshot the current sysctl configuration."
        printf 'current_config_backup=%s\n' "$BACKUP_DIR/$rollback_id-config.conf" >> "$ROLLBACK_MANIFEST" ||
            die "Cannot record the current sysctl configuration backup."
    else
        state="absent"
    fi
    printf 'current_config_state=%s\n' "$state" >> "$ROLLBACK_MANIFEST" ||
        die "Cannot record the current sysctl configuration state."

    if [[ -f "$BBR_MODULE_CONF" ]]; then
        state="present"
        cp -p "$BBR_MODULE_CONF" "$BACKUP_DIR/$rollback_id-module.conf" ||
            die "Cannot snapshot the current BBR module configuration."
        printf 'current_module_backup=%s\n' "$BACKUP_DIR/$rollback_id-module.conf" >> "$ROLLBACK_MANIFEST" ||
            die "Cannot record the current BBR module configuration backup."
    else
        state="absent"
    fi
    printf 'current_module_state=%s\n' "$state" >> "$ROLLBACK_MANIFEST" ||
        die "Cannot record the current BBR module configuration state."

    : > "$ROLLBACK_RUNTIME_BACKUP" ||
        die "Cannot create the rollback runtime snapshot."
    while IFS=$'\t' read -r key _; do
        value="$(sysctl -n "$key" 2>/dev/null)" ||
            die "Cannot snapshot runtime sysctl value: $key"
        printf '%s\t%s\n' "$key" "$value" >> "$ROLLBACK_RUNTIME_BACKUP" ||
            die "Cannot write the rollback runtime snapshot."
    done < "$source_runtime_backup"
}

restore_rollback_compensation() {
    local failed=0

    restore_managed_file \
        "current_config_state" \
        "current_config_backup" \
        "$CONF" \
        "$ROLLBACK_MANIFEST" || failed=1
    restore_managed_file \
        "current_module_state" \
        "current_module_backup" \
        "$BBR_MODULE_CONF" \
        "$ROLLBACK_MANIFEST" || failed=1
    restore_runtime_values "$ROLLBACK_RUNTIME_BACKUP" || failed=1

    return "$failed"
}

restore_after_apply_failure() {
    local temporary_conf="$1"

    restore_runtime_values "$RUNTIME_BACKUP" ||
        warning "Some runtime values could not be restored automatically."
    restore_managed_file "module_state" "module_backup" "$BBR_MODULE_CONF" "$MANIFEST" ||
        warning "The BBR module-load file could not be restored automatically."
    rm -f "$temporary_conf"
}

apply_configuration() {
    local temporary_conf

    require_command sysctl
    require_command mktemp
    require_command install
    require_command ip
    acquire_lock
    confirm "Apply"

    profile_buffer_max "$PROFILE" >/dev/null ||
        die "Invalid profile: $PROFILE"

    section "Preparing VPN network configuration"
    detect_bbr 1 || warning "BBR will not be written because the kernel does not support it."
    detect_fq 1 || warning "FQ will not be written because sch_fq is unavailable."

    initialize_transaction
    temporary_conf="$(mktemp "${CONF}.tmp.XXXXXX")" ||
        die "Cannot create temporary sysctl configuration."

    if ! render_sysctl_config "$BBR_AVAILABLE" "$FQ_AVAILABLE" "$PROFILE" "$ENABLE_MTU_PROBING" > "$temporary_conf"; then
        rm -f "$temporary_conf"
        die "Cannot render sysctl configuration."
    fi

    snapshot_runtime_values "$temporary_conf"
    reconcile_bbr_module_config

    if ! sysctl -p "$temporary_conf" > "$APPLY_LOG" 2>&1; then
        error "The temporary configuration was rejected. Restoring runtime values."
        restore_after_apply_failure "$temporary_conf"
        tail -n 40 "$APPLY_LOG" >&2 || true
        exit 1
    fi

    if ! chmod 0644 "$temporary_conf" || ! mv -f "$temporary_conf" "$CONF"; then
        error "Cannot atomically install $CONF. Restoring runtime values."
        restore_after_apply_failure "$temporary_conf"
        exit 1
    fi

    if ! persist_latest_transaction; then
        error "Cannot update the rollback pointer. Restoring the previous state."
        restore_managed_file "config_state" "config_backup" "$CONF" "$MANIFEST" ||
            warning "The sysctl configuration file could not be restored automatically."
        restore_after_apply_failure "$temporary_conf"
        exit 1
    fi

    success "Configuration applied and backed up."
    printf 'Configuration: %s\n' "$CONF"
    printf 'Transaction:   %s\n' "$MANIFEST"
}

rollback_configuration() {
    local pointer="$BACKUP_DIR/latest-transaction"
    local previous_manifest
    local runtime_backup

    require_command sysctl
    require_command mktemp
    require_command install
    acquire_lock
    confirm "Rollback"

    [[ -r "$pointer" ]] || die "No previous transaction pointer exists."
    previous_manifest="$(<"$pointer")"
    [[ -r "$previous_manifest" ]] || die "The latest transaction manifest is unavailable."
    validate_transaction_manifest "$previous_manifest" ||
        die "The latest transaction manifest is incomplete or invalid."

    runtime_backup="$(manifest_value "runtime_backup" "$previous_manifest")"
    snapshot_rollback_state "$runtime_backup"

    section "Rolling back VPN network configuration"
    if ! restore_managed_file "config_state" "config_backup" "$CONF" "$previous_manifest"; then
        restore_rollback_compensation ||
            warning "Rollback compensation could not fully restore the original state."
        die "Cannot restore the previous sysctl configuration file."
    fi
    if ! restore_managed_file "module_state" "module_backup" "$BBR_MODULE_CONF" "$previous_manifest"; then
        restore_rollback_compensation ||
            warning "Rollback compensation could not fully restore the original state."
        die "Cannot restore the previous BBR module-load configuration."
    fi
    if ! restore_runtime_values "$runtime_backup"; then
        restore_rollback_compensation ||
            warning "Rollback compensation could not fully restore the original state."
        die "The previous runtime values could not be fully restored."
    fi

    success "Latest transaction has been rolled back."
}

verify_applied_configuration() {
    local default_qdisc
    local actual_qdisc

    section "Applied configuration verification"
    printf 'Congestion control: '
    sysctl -n net.ipv4.tcp_congestion_control 2>/dev/null || printf 'unknown\n'
    default_qdisc="$(sysctl -n net.core.default_qdisc 2>/dev/null || printf 'unknown')"
    printf 'Default qdisc:      %s\n' "$default_qdisc"
    printf 'TCP rmem:           '
    sysctl -n net.ipv4.tcp_rmem 2>/dev/null || printf 'unknown\n'
    printf 'TCP wmem:           '
    sysctl -n net.ipv4.tcp_wmem 2>/dev/null || printf 'unknown\n'

    if detect_default_iface && command -v tc >/dev/null 2>&1; then
        printf '\nActual qdisc on %s:\n' "$DEFAULT_IFACE"
        actual_qdisc="$(tc qdisc show dev "$DEFAULT_IFACE" 2>/dev/null || true)"
        printf '%s\n' "$actual_qdisc"
        if [[ "$default_qdisc" == "fq" ]] && grep -Eq '^qdisc fq ' <<< "$actual_qdisc"; then
            success "FQ is visible on the current interface."
        elif [[ "$default_qdisc" == "fq" ]]; then
            warning "fq is persisted as the default but is not visible on this interface now."
        fi
    fi
}

main() {
    parse_args "$@"

    case "$MODE" in
        help)
            usage
            ;;
        diagnose)
            run_diagnose
            ;;
        apply)
            require_root
            apply_configuration
            verify_applied_configuration
            ;;
        rollback)
            require_root
            rollback_configuration
            verify_applied_configuration
            ;;
    esac
}

if [[ "${VPS_OPT_LIBRARY_ONLY:-0}" != "1" && "${BASH_SOURCE[0]}" == "$0" ]]; then
    main "$@"
fi
