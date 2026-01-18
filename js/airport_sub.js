/**
 * Egern Panel - 基线验证脚本
 * 作用：只验证 Panel 是否能显示
 */

let title = "机场订阅";
let icon = "airplane.circle.fill";
let color = "#0D918D";

try {
  if (typeof $argument === "string") {
    const args = $argument.split("&");
    args.forEach(p => {
      const [k, v] = p.split("=");
      if (k === "title") title = decodeURIComponent(v);
      if (k === "icon") icon = v;
      if (k === "color") color = v;
    });
  }
} catch (e) {
  // 吃掉所有异常，保证能 done
}

$done({
  title,
  content: "✅ Panel 基线测试成功\n如果你看到这行字，说明 Egern Panel 机制是通的。",
  icon,
  "icon-color": color
});