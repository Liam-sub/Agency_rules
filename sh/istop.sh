#!/bin/bash
# ============================================================
# iperf3 服务管理工具
# 快捷命令：istop
# 适用于 Debian / Ubuntu / systemd
# ============================================================

set -u

SERVICE="iperf3"
PORT="5201"
CMD="/usr/bin/iperf3"
MENU_NAME="iperf3 服务管理工具"

RED='\033[31m'
GREEN='\033[32m'
YELLOW='\033[33m'
CYAN='\033[36m'
BLUE='\033[34m'
RESET='\033[0m'

[[ $EUID -eq 0 ]] || {
    echo -e "${RED}错误：请使用 root 权限运行。${RESET}"
    exit 1
}

clear

is_installed() {
    command -v iperf3 >/dev/null 2>&1
}

service_exists() {
    systemctl list-unit-files --type=service 2>/dev/null | grep -q "^${SERVICE}.service"
}

is_running() {
    systemctl is-active --quiet "$SERVICE" 2>/dev/null
}

is_enabled() {
    systemctl is-enabled --quiet "$SERVICE" 2>/dev/null
}

port_listening() {
    if command -v ss >/dev/null 2>&1; then
        ss -lnt 2>/dev/null | awk -v p=":${PORT}" '$4 ~ p"$" {found=1} END {exit !found}'
    else
        return 1
    fi
}

draw_line() {
    printf '%b\n' "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
}

show_status() {
    if is_running; then
        status="${GREEN}运行中${RESET}"
    else
        status="${RED}已停止${RESET}"
    fi

    if is_enabled; then
        boot="${GREEN}已启用${RESET}"
    else
        boot="${RED}已禁用${RESET}"
    fi

    if port_listening; then
        port_status="${GREEN}监听中${RESET}"
    else
        port_status="${RED}否${RESET}"
    fi

    if is_installed; then
        version="$(iperf3 --version 2>/dev/null | head -n 1 | sed 's/^iperf //')"
    else
        version="${RED}未安装${RESET}"
    fi

    echo
    echo -e "${CYAN}╔════════════════════════════════════════════╗${RESET}"
    printf "${CYAN}║${RESET}       ${GREEN}${MENU_NAME}${RESET}       ${CYAN}║${RESET}\n"
    printf "${CYAN}║${RESET}       快捷启动：${GREEN}istop${RESET}                  ${CYAN}║${RESET}\n"
    echo -e "${CYAN}╚════════════════════════════════════════════╝${RESET}"
    echo
    echo -e "服务状态：  $status"
    echo -e "开机自启：  $boot"
    echo -e "端口 ${PORT}：  $port_status"
    echo -e "版本：      ${version}"
    echo
}

install_iperf3() {
    echo
    echo -e "${YELLOW}正在安装 iperf3...${RESET}"

    if is_installed; then
        echo -e "${GREEN}iperf3 已经安装。${RESET}"
    else
        if command -v apt-get >/dev/null 2>&1; then
            apt-get update
            DEBIAN_FRONTEND=noninteractive apt-get install -y iperf3
        elif command -v dnf >/dev/null 2>&1; then
            dnf install -y iperf3
        elif command -v yum >/dev/null 2>&1; then
            yum install -y iperf3
        else
            echo -e "${RED}未找到 apt/dnf/yum，无法自动安装。${RESET}"
            return 1
        fi
    fi

    if ! is_installed; then
        echo -e "${RED}iperf3 安装失败。${RESET}"
        return 1
    fi

    cat > "/etc/systemd/system/${SERVICE}.service" <<EOF
[Unit]
Description=iperf3 Server
After=network.target

[Service]
Type=simple
ExecStart=${CMD} -s -p ${PORT}
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable "$SERVICE" >/dev/null 2>&1
    systemctl restart "$SERVICE"

    echo
    echo -e "${GREEN}iperf3 服务安装完成。${RESET}"
    echo -e "监听端口：${GREEN}${PORT}${RESET}"
    echo -e "服务命令：${GREEN}systemctl status ${SERVICE}${RESET}"
    echo -e "快捷命令：${GREEN}istop${RESET}"
    sleep 2
}

stop_service() {
    if service_exists; then
        systemctl stop "$SERVICE" 2>/dev/null || true
        systemctl disable "$SERVICE" 2>/dev/null || true
        echo -e "${GREEN}iperf3 服务已停止，并已关闭开机自启。${RESET}"
    else
        echo -e "${YELLOW}iperf3 服务尚未安装。${RESET}"
    fi
    sleep 1
}

enable_service() {
    if ! is_installed; then
        echo -e "${YELLOW}iperf3 尚未安装，正在安装...${RESET}"
        install_iperf3
        return
    fi

    if ! service_exists; then
        cat > "/etc/systemd/system/${SERVICE}.service" <<EOF
[Unit]
Description=iperf3 Server
After=network.target

[Service]
Type=simple
ExecStart=${CMD} -s -p ${PORT}
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
        systemctl daemon-reload
    fi

    systemctl enable "$SERVICE" >/dev/null 2>&1
    systemctl restart "$SERVICE"

    echo -e "${GREEN}已恢复开机自启，并启动 iperf3 服务。${RESET}"
    sleep 1
}

uninstall_iperf3() {
    echo
    echo -e "${RED}警告：此操作将卸载 iperf3 并删除服务配置。${RESET}"
    read -r -p "确定继续吗？输入 YES 确认： " confirm

    if [[ "$confirm" != "YES" ]]; then
        echo -e "${YELLOW}已取消。${RESET}"
        sleep 1
        return
    fi

    systemctl stop "$SERVICE" 2>/dev/null || true
    systemctl disable "$SERVICE" 2>/dev/null || true
    rm -f "/etc/systemd/system/${SERVICE}.service"
    systemctl daemon-reload

    if command -v apt-get >/dev/null 2>&1; then
        DEBIAN_FRONTEND=noninteractive apt-get remove -y iperf3
    elif command -v dnf >/dev/null 2>&1; then
        dnf remove -y iperf3
    elif command -v yum >/dev/null 2>&1; then
        yum remove -y iperf3
    fi

    echo -e "${GREEN}iperf3 已卸载。${RESET}"
    sleep 2
}

install_shortcut() {
    local target="/usr/local/bin/istop"

    # 当前脚本可能由临时路径执行，因此复制自身
    cp -f "$0" "$target"
    chmod +x "$target"

    echo -e "${GREEN}快捷命令已安装：istop${RESET}"
}

show_menu() {
    show_status

    echo -e "${BLUE}[1]${RESET} 停止服务 + 关闭自启动"
    echo -e "${BLUE}[2]${RESET} 安装 / 重装 iperf3 ${RED}[不可逆卸载]${RESET}"
    echo -e "${BLUE}[3]${RESET} 恢复自启动并启动服务"
    echo -e "${BLUE}[4]${RESET} 帮助说明"
    echo -e "${BLUE}[5]${RESET} 卸载 iperf3（删除本工具）"
    echo -e "${BLUE}[6]${RESET} 退出"
    echo

    read -r -p "请选择 [1-6]: " choice

    case "$choice" in
        1) stop_service ;;
        2) install_iperf3 ;;
        3) enable_service ;;
        4)
            echo
            echo "iperf3 服务端默认监听 TCP ${PORT}。"
            echo "客户端测试示例："
            echo "  iperf3 -c 服务器IP"
            echo
            echo "查看实时状态："
            echo "  systemctl status iperf3"
            echo
            read -r -p "按回车返回..."
            ;;
        5) uninstall_iperf3 ;;
        6) exit 0 ;;
        *) echo -e "${RED}无效选项。${RESET}"; sleep 1 ;;
    esac
}

# 如果不是通过快捷命令调用，则首次运行时自动安装 istop
if [[ "$(basename "$0")" != "istop" ]]; then
    install_shortcut
fi

while true; do
    show_menu
done
