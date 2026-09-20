#!/usr/bin/env bash

# ============================================================
# Debian / Ubuntu VPS Network Optimization v2026.4
#
# 适用：
#   Debian 11 / 12 / 13
#   Ubuntu 22.04 / 24.04 / 26.04
#   1~4GB RAM VPS
#   3x-ui / Xray
#
# 协议：
#   VLESS + TLS
#   Trojan + TLS
#   Hysteria 2 + TLS
#
# 核心目标：
#   TCP：BBR + FQ + SACK + TCP Buffer + TFO
#   UDP：合理的全局 UDP Buffer（Hysteria 2 / QUIC）
#   丢包：启用 TCP MTU probing，辅助处理 PMTU black-hole
#
# 原则：
#   - 固定 TCP 参数，不做动态 TCP 调优
#   - 不自动修改 MTU
#   - 不自动修改 MSS
#   - 不自动修改网卡 Offload
#   - 不关闭 IPv6
#   - 不修改 3x-ui / Xray 配置
#   - 不使用 tcp_tw_reuse / tcp_fin_timeout 等“玄学”参数
#
# 注意：
#   TCP Buffer 的 64MB 是上限，不代表每条连接都会占用 64MB。
# ============================================================

set -u
set -o pipefail

VERSION="2026.4"
CONF="/etc/sysctl.d/99-vps-network-optimization.conf"
BACKUP_DIR="/root/sysctl-backup"
LOG_FILE="/var/log/vps-network-optimization.log"

# ============================================================
# 基础函数
# ============================================================

print_line() {
    echo "------------------------------------------------------------"
}

print_title() {
    echo
    echo "============================================================"
    echo " $1"
    echo "============================================================"
}

info() {
    echo "ℹ️  $1"
}

success() {
    echo "✅ $1"
}

warning() {
    echo "⚠️  $1"
}

error() {
    echo "❌ $1"
}

# 同时输出到终端和日志
exec > >(tee -a "$LOG_FILE") 2>&1

# ============================================================
# Root 检查
# ============================================================

if [ "$(id -u)" -ne 0 ]; then
    error "请使用 root 权限运行此脚本"
    echo
    echo "例如："
    echo "  sudo bash $0"
    echo
    exit 1
fi

# ============================================================
# 系统信息
# ============================================================

print_title "系统信息"

if [ ! -f /etc/os-release ]; then
    error "无法读取 /etc/os-release"
    exit 1
fi

. /etc/os-release

echo "系统      : ${PRETTY_NAME:-Unknown}"
echo "系统 ID   : ${ID:-Unknown}"
echo "版本      : ${VERSION_ID:-Unknown}"
echo "内核      : $(uname -r)"
echo "架构      : $(uname -m)"
echo "主机名    : $(hostname)"
echo "运行时间  : $(uptime -p 2>/dev/null || uptime)"

# ============================================================
# Debian / Ubuntu 兼容性检查
# ============================================================

print_title "Debian / Ubuntu 兼容性检查"

case "${ID:-}" in
    debian)
        success "检测到 Debian ${VERSION_ID:-Unknown}"
        case "${VERSION_ID:-}" in
            11|12|13)
                success "Debian ${VERSION_ID} 属于推荐范围"
                ;;
            *)
                warning "当前 Debian 版本为 ${VERSION_ID:-Unknown}，仍会尝试执行"
                ;;
        esac
        ;;
    ubuntu)
        success "检测到 Ubuntu ${VERSION_ID:-Unknown}"
        case "${VERSION_ID:-}" in
            22.04|24.04|26.04)
                success "Ubuntu ${VERSION_ID} 属于推荐范围"
                ;;
            *)
                warning "当前 Ubuntu 版本为 ${VERSION_ID:-Unknown}，仍会尝试执行"
                ;;
        esac
        ;;
    *)
        warning "当前系统不是 Debian/Ubuntu"
        echo "检测到：${PRETTY_NAME:-Unknown}"
        echo
        read -r -p "仍然继续执行？[y/N] " ANSWER
        case "$ANSWER" in
            y|Y) ;;
            *) echo "已取消。"; exit 0 ;;
        esac
        ;;
esac

# ============================================================
# 检查基础工具
# ============================================================

print_title "检查系统工具"

for cmd in sysctl ip ss awk sed grep date hostname uname free; do
    if command -v "$cmd" >/dev/null 2>&1; then
        success "$cmd 可用"
    else
        error "$cmd 不存在"
        exit 1
    fi
done

# tc / modprobe / ethtool
if ! command -v tc >/dev/null 2>&1; then
    warning "tc 不存在，尝试安装 iproute2"
    DEBIAN_FRONTEND=noninteractive apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y iproute2
fi

if ! command -v modprobe >/dev/null 2>&1; then
    warning "modprobe 不存在，尝试安装 kmod"
    DEBIAN_FRONTEND=noninteractive apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y kmod
fi

if ! command -v ethtool >/dev/null 2>&1; then
    info "ethtool 不存在，尝试安装"
    DEBIAN_FRONTEND=noninteractive apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y ethtool >/dev/null 2>&1 || true
fi

command -v tc >/dev/null 2>&1 && success "tc 可用" || warning "tc 仍不可用"
command -v modprobe >/dev/null 2>&1 && success "modprobe 可用" || warning "modprobe 仍不可用"
command -v ethtool >/dev/null 2>&1 && success "ethtool 可用" || warning "ethtool 不可用，跳过 Offload 检查"

# ============================================================
# 默认网卡
# ============================================================

print_title "检测默认网络接口"

DEFAULT_IFACE="$(ip -4 route show default 2>/dev/null | awk 'NR==1 {print $5}')"

if [ -z "${DEFAULT_IFACE:-}" ]; then
    DEFAULT_IFACE="$(ip route show default 2>/dev/null | awk 'NR==1 {print $5}')"
fi

if [ -n "${DEFAULT_IFACE:-}" ]; then
    success "默认网卡：$DEFAULT_IFACE"
    ip -brief address show "$DEFAULT_IFACE" 2>/dev/null || true
    echo
    ip link show dev "$DEFAULT_IFACE" 2>/dev/null | grep -o 'mtu [0-9]*' || true
else
    warning "没有检测到默认网卡"
fi

# ============================================================
# 当前网络状态
# ============================================================

print_title "当前网络参数"

echo
echo "[拥塞控制]"
sysctl net.ipv4.tcp_congestion_control 2>/dev/null || true
sysctl net.ipv4.tcp_available_congestion_control 2>/dev/null || true

echo
echo "[QDISC]"
sysctl net.core.default_qdisc 2>/dev/null || true

echo
echo "[TCP Receive Buffer]"
sysctl net.ipv4.tcp_rmem 2>/dev/null || true
sysctl net.core.rmem_max 2>/dev/null || true

echo
echo "[TCP Send Buffer]"
sysctl net.ipv4.tcp_wmem 2>/dev/null || true
sysctl net.core.wmem_max 2>/dev/null || true

echo
echo "[TCP 特性]"
sysctl net.ipv4.tcp_sack 2>/dev/null || true
sysctl net.ipv4.tcp_timestamps 2>/dev/null || true
sysctl net.ipv4.tcp_window_scaling 2>/dev/null || true
sysctl net.ipv4.tcp_fastopen 2>/dev/null || true
sysctl net.ipv4.tcp_mtu_probing 2>/dev/null || true

# ============================================================
# BBR
# ============================================================

print_title "检测 / 加载 BBR"

BBR_AVAILABLE=0

if sysctl net.ipv4.tcp_available_congestion_control 2>/dev/null | grep -qw bbr; then
    BBR_AVAILABLE=1
    success "BBR 已存在于当前内核"
else
    info "当前没有检测到 BBR，尝试加载 tcp_bbr"

    modprobe tcp_bbr 2>/dev/null || true

    if sysctl net.ipv4.tcp_available_congestion_control 2>/dev/null | grep -qw bbr; then
        BBR_AVAILABLE=1
        success "tcp_bbr 加载成功"
    else
        error "当前内核没有可用 BBR"
        echo
        echo "当前内核：$(uname -r)"
        echo
        echo "可检查："
        echo "  modinfo tcp_bbr"
        echo "  sysctl net.ipv4.tcp_available_congestion_control"
        echo
    fi
fi

# ============================================================
# BBR 持久化
# ============================================================

if [ "$BBR_AVAILABLE" -eq 1 ]; then
    mkdir -p /etc/modules-load.d

    if [ -f /etc/modules-load.d/bbr.conf ] && grep -qx "tcp_bbr" /etc/modules-load.d/bbr.conf; then
        success "BBR 开机加载配置已存在"
    else
        echo "tcp_bbr" > /etc/modules-load.d/bbr.conf
        success "已设置 tcp_bbr 开机自动加载"
    fi
fi

# ============================================================
# FQ
# ============================================================

print_title "检测 / 加载 FQ"

modprobe sch_fq 2>/dev/null || true

if [ -e /sys/module/sch_fq ]; then
    success "sch_fq 模块可用"
else
    warning "未检测到 sch_fq 模块"
fi

# ============================================================
# 备份
# ============================================================

print_title "备份现有配置"

mkdir -p "$BACKUP_DIR"

BACKUP_FILE="$BACKUP_DIR/sysctl-$(date +%Y%m%d-%H%M%S).conf"
sysctl -a 2>/dev/null > "$BACKUP_FILE" || true
success "当前 sysctl 已备份：$BACKUP_FILE"

if [ -f "$CONF" ]; then
    OLD_BACKUP="$BACKUP_DIR/99-vps-network-optimization-$(date +%Y%m%d-%H%M%S).conf"
    cp -a "$CONF" "$OLD_BACKUP"
    success "旧的优化配置已备份：$OLD_BACKUP"
fi

# 记录当前 QDISC，方便人工恢复
if [ -n "${DEFAULT_IFACE:-}" ] && command -v tc >/dev/null 2>&1; then
    tc qdisc show dev "$DEFAULT_IFACE" > \
        "$BACKUP_DIR/qdisc-${DEFAULT_IFACE}-$(date +%Y%m%d-%H%M%S).txt" 2>/dev/null || true
fi

# ============================================================
# 生成 Debian 固定 TCP 配置
# ============================================================

print_title "生成 Debian 网络优化配置"

cat > "$CONF" <<'EOF'
# ============================================================
# Debian VPS Network Optimization v2026.3
#
# Static TCP tuning:
#   BBR + FQ
#   TCP rmem/wmem 64MB max
#   SACK
#   Window Scaling
#   TCP Timestamps
#   TCP Fast Open
#   TCP MTU probing
#
# UDP / QUIC:
#   64MB global buffer ceiling
#
# Intentionally NOT changed:
#   MTU
#   MSS
#   NIC Offload
#   IPv6
#   TCP TW/FIN/backlog/conntrack "aggressive" tuning
# ============================================================


# ============================================================
# TCP congestion control
# ============================================================

net.ipv4.tcp_congestion_control = bbr


# ============================================================
# Queue discipline
# ============================================================

net.core.default_qdisc = fq


# ============================================================
# TCP receive buffer
# min / default / max
#
# 64MB is an upper limit, not per-connection preallocation.
# ============================================================

net.ipv4.tcp_rmem = 4096 87380 67108864
net.core.rmem_max = 67108864


# ============================================================
# TCP send buffer
# min / default / max
# ============================================================

net.ipv4.tcp_wmem = 4096 65536 67108864
net.core.wmem_max = 67108864


# ============================================================
# UDP / QUIC
#
# Hysteria 2 uses UDP / QUIC.
# Keep defaults moderate and allow up to 64MB when needed.
# ============================================================

net.core.rmem_default = 262144
net.core.wmem_default = 262144


# ============================================================
# TCP window scaling
# ============================================================

net.ipv4.tcp_window_scaling = 1


# ============================================================
# TCP SACK
#
# Important for recovery in packet-loss environments.
# ============================================================

net.ipv4.tcp_sack = 1


# ============================================================
# TCP timestamps
# ============================================================

net.ipv4.tcp_timestamps = 1


# ============================================================
# TCP Fast Open
#
# 1 = client
# 2 = server
# 3 = both
# ============================================================

net.ipv4.tcp_fastopen = 3


# ============================================================
# TCP MTU probing
#
# 0 = disabled
# 1 = enable when a suspected ICMP black hole is detected
# 2 = always probe
#
# Use 1 to avoid forcing smaller MTU globally.
# ============================================================

net.ipv4.tcp_mtu_probing = 1


# ============================================================
# TCP keepalive
#
# Stale connection detection only; not a throughput tweak.
# ============================================================

net.ipv4.tcp_keepalive_time = 600
net.ipv4.tcp_keepalive_intvl = 60
net.ipv4.tcp_keepalive_probes = 5
EOF

success "配置文件生成完成：$CONF"

# ============================================================
# 应用配置
# ============================================================

print_title "应用 sysctl 配置"

SYSCTL_LOG="/tmp/vps-network-sysctl.log"

if sysctl --system >"$SYSCTL_LOG" 2>&1; then
    success "sysctl --system 执行完成"
else
    warning "sysctl --system 返回异常，检查日志"
    tail -50 "$SYSCTL_LOG"
fi

# 强制当前会话立即使用 BBR / FQ
if [ "$BBR_AVAILABLE" -eq 1 ]; then
    sysctl -w net.ipv4.tcp_congestion_control=bbr >/dev/null 2>&1 || true
fi

sysctl -w net.core.default_qdisc=fq >/dev/null 2>&1 || true

# ============================================================
# 当前网卡立即切换到 FQ
#
# 注意：
# default_qdisc 主要影响新建 qdisc；这里额外尝试让当前接口立即生效。
# ============================================================

print_title "应用当前网卡 FQ"

if [ -n "${DEFAULT_IFACE:-}" ] && command -v tc >/dev/null 2>&1; then
    if tc qdisc replace dev "$DEFAULT_IFACE" root fq 2>/dev/null; then
        success "当前网卡 $DEFAULT_IFACE 已尝试切换为 FQ"
    else
        warning "当前网卡无法直接切换为 FQ，保留系统 default_qdisc=fq"
    fi

    echo
    tc qdisc show dev "$DEFAULT_IFACE" 2>/dev/null || true
else
    warning "无法应用当前网卡 FQ"
fi

# ============================================================
# 验证
# ============================================================

print_title "验证核心配置"

echo
echo "========== BBR =========="
CURRENT_CC="$(sysctl -n net.ipv4.tcp_congestion_control 2>/dev/null || echo unknown)"
echo "拥塞控制：$CURRENT_CC"

if [ "$CURRENT_CC" = "bbr" ]; then
    success "BBR 正在使用"
else
    warning "当前拥塞控制不是 BBR"
fi

echo
echo "========== QDISC =========="
CURRENT_QDISC="$(sysctl -n net.core.default_qdisc 2>/dev/null || echo unknown)"
echo "默认 QDISC：$CURRENT_QDISC"

if [ "$CURRENT_QDISC" = "fq" ]; then
    success "默认 QDISC = fq"
else
    warning "默认 QDISC 不是 fq"
fi

echo
echo "========== TCP Buffer =========="
sysctl net.ipv4.tcp_rmem
sysctl net.ipv4.tcp_wmem
sysctl net.core.rmem_max
sysctl net.core.wmem_max

echo
echo "========== UDP Buffer =========="
sysctl net.core.rmem_default
sysctl net.core.wmem_default

echo
echo "========== TCP Features =========="
sysctl net.ipv4.tcp_window_scaling
sysctl net.ipv4.tcp_sack
sysctl net.ipv4.tcp_timestamps
sysctl net.ipv4.tcp_fastopen
sysctl net.ipv4.tcp_mtu_probing

# ============================================================
# TCP 重传监控
# ============================================================

print_title "TCP 重传基线"

if command -v nstat >/dev/null 2>&1; then
    nstat -az 2>/dev/null | grep -Ei \
        'TcpRetransSegs|TCPTimeouts|TCPFastRetrans|TCPSackRecovery|TCPSynRetrans' \
        || true
else
    warning "nstat 不可用，跳过 TCP 重传基线"
fi

if command -v ss >/dev/null 2>&1; then
    echo
    ss -s 2>/dev/null || true
fi

# ============================================================
# IPv4 / IPv6
# ============================================================

print_title "IPv4 / IPv6"

IPV4_ADDR="$(ip -4 addr show scope global 2>/dev/null | awk '/inet / {print $2}' | head -1)"
IPV6_ADDR="$(ip -6 addr show scope global 2>/dev/null | awk '/inet6/ && $2 !~ /^fe80/ {print $2}' | head -1)"

if [ -n "${IPV4_ADDR:-}" ]; then
    success "IPv4：$IPV4_ADDR"
else
    warning "未检测到公网 IPv4"
fi

if [ -n "${IPV6_ADDR:-}" ]; then
    success "IPv6：$IPV6_ADDR"
    info "IPv6 保持系统默认行为，不自动关闭"
else
    info "没有检测到公网 IPv6"
fi

# ============================================================
# MTU 检测
# ============================================================

print_title "MTU 检测"

if [ -n "${DEFAULT_IFACE:-}" ]; then
    CURRENT_MTU="$(ip link show dev "$DEFAULT_IFACE" 2>/dev/null |
        sed -n 's/.*mtu \([0-9]*\).*/\1/p' | head -1)"

    echo "默认网卡：$DEFAULT_IFACE"
    echo "当前 MTU ：${CURRENT_MTU:-Unknown}"

    if [ "${CURRENT_MTU:-0}" = "1500" ]; then
        info "当前 MTU = 1500；脚本不自动修改"
    elif [ -n "${CURRENT_MTU:-}" ]; then
        info "当前 MTU = $CURRENT_MTU；请结合实际线路测试"
    fi
else
    warning "无法检测 MTU"
fi

# ============================================================
# Offload 检测
# ============================================================

print_title "网卡 Offload 检测"

if [ -n "${DEFAULT_IFACE:-}" ] && command -v ethtool >/dev/null 2>&1; then
    echo "网卡：$DEFAULT_IFACE"
    echo

    ethtool -k "$DEFAULT_IFACE" 2>/dev/null |
        grep -E \
        'tcp-segmentation-offload|generic-segmentation-offload|generic-receive-offload|large-receive-offload|tx-checksum|rx-checksum' \
        || true

    echo
    info "只检测，不自动修改 Offload"
else
    warning "无法检测 Offload"
fi

# ============================================================
# 内存
# ============================================================

print_title "内存状态"

free -h

# ============================================================
# TCP / UDP 当前连接
# ============================================================

print_title "TCP / UDP 当前连接"

echo
echo "TCP："
ss -s 2>/dev/null | head -20 || true

echo
echo "UDP："
ss -u -s 2>/dev/null | head -20 || true

# ============================================================
# 最终摘要
# ============================================================

print_title "最终配置摘要"

echo
printf "%-28s %s\n" "BBR" \
    "$(sysctl -n net.ipv4.tcp_congestion_control 2>/dev/null || echo unknown)"

printf "%-28s %s\n" "Default QDISC" \
    "$(sysctl -n net.core.default_qdisc 2>/dev/null || echo unknown)"

printf "%-28s %s\n" "TCP rmem" \
    "$(sysctl -n net.ipv4.tcp_rmem 2>/dev/null || echo unknown)"

printf "%-28s %s\n" "TCP wmem" \
    "$(sysctl -n net.ipv4.tcp_wmem 2>/dev/null || echo unknown)"

printf "%-28s %s\n" "rmem_max" \
    "$(sysctl -n net.core.rmem_max 2>/dev/null || echo unknown)"

printf "%-28s %s\n" "wmem_max" \
    "$(sysctl -n net.core.wmem_max 2>/dev/null || echo unknown)"

printf "%-28s %s\n" "UDP rmem_default" \
    "$(sysctl -n net.core.rmem_default 2>/dev/null || echo unknown)"

printf "%-28s %s\n" "UDP wmem_default" \
    "$(sysctl -n net.core.wmem_default 2>/dev/null || echo unknown)"

printf "%-28s %s\n" "TCP Fast Open" \
    "$(sysctl -n net.ipv4.tcp_fastopen 2>/dev/null || echo unknown)"

printf "%-28s %s\n" "TCP MTU probing" \
    "$(sysctl -n net.ipv4.tcp_mtu_probing 2>/dev/null || echo unknown)"

# ============================================================
# 最终状态
# ============================================================

print_title "优化结果"

FINAL_CC="$(sysctl -n net.ipv4.tcp_congestion_control 2>/dev/null || echo unknown)"
FINAL_QDISC="$(sysctl -n net.core.default_qdisc 2>/dev/null || echo unknown)"
FINAL_SACK="$(sysctl -n net.ipv4.tcp_sack 2>/dev/null || echo 0)"
FINAL_TFO="$(sysctl -n net.ipv4.tcp_fastopen 2>/dev/null || echo 0)"
FINAL_MTU_PROBE="$(sysctl -n net.ipv4.tcp_mtu_probing 2>/dev/null || echo 0)"

[ "$FINAL_CC" = "bbr" ] && success "BBR：OK" || warning "BBR：未生效"
[ "$FINAL_QDISC" = "fq" ] && success "Default QDISC：FQ" || warning "Default QDISC：非 FQ"
[ "$FINAL_SACK" = "1" ] && success "TCP SACK：OK" || warning "TCP SACK：请检查"
[ "$FINAL_TFO" = "3" ] && success "TCP Fast Open：OK" || warning "TCP Fast Open：请检查"
[ "$FINAL_MTU_PROBE" = "1" ] && success "TCP MTU Probing：OK" || warning "TCP MTU Probing：请检查"

echo
echo "============================================================"
echo " Debian / Ubuntu VPS 网络优化完成 - v${VERSION}"
echo "============================================================"
echo
echo "配置文件："
echo "  $CONF"
echo
echo "备份目录："
echo "  $BACKUP_DIR"
echo
echo "日志："
echo "  $LOG_FILE"
echo
echo "本版本特点："
echo "  1. Debian / Ubuntu 双系统兼容"
echo "     Debian 11/12/13；Ubuntu 22.04/24.04/26.04"
echo "  2. 固定 TCP 调优，不做动态 TCP"
echo "  3. BBR + FQ"
echo "  4. TCP Buffer 最大 64MB"
echo "  5. TCP SACK / Window Scaling / Timestamps"
echo "  6. TCP Fast Open"
echo "  7. TCP MTU Probing = 1，辅助处理 PMTU black-hole"
echo "  8. UDP / QUIC 保留合理 buffer"
echo "  9. MTU / MSS 不自动修改"
echo " 10. 网卡 Offload 只检测"
echo " 11. IPv6 不自动关闭"
echo " 12. 不修改 3x-ui / Xray"
echo
echo "建议后续重点观察 TCP 重传："
echo
echo "  nstat -az | grep -Ei 'Retrans|Timeout|TCPLoss'"
echo
echo "以及："
echo
echo "  tc qdisc show dev $DEFAULT_IFACE"
echo
echo "============================================================"
