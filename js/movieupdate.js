/*
🎬 Movie Tracker Widget (Egern / Scriptable 风格)
*/

// ===== 默认配置 =====
let API = "https://api.themoviedb.org/3/configuration?api_key=92e05285c9b611b728e963fc7f3bb96b";
let FOLLOW = ["一人之下", "梦魇绝镇"];
let MAX = 6;

// ===== 参数覆盖（核心）=====
if (args.widgetParameter) {
  let p = args.widgetParameter.split(";");

  // 格式：api;follow1,follow2;max
  API = p[0] || API;
  FOLLOW = p[1] ? p[1].split(",") : FOLLOW;
  MAX = p[2] ? Number(p[2]) : MAX;
}

// ===== 创建 Widget =====
async function createWidget() {
  let widget = new ListWidget();

  // 标题
  let title = widget.addText("🎬 追更列表");
  title.font = Font.boldSystemFont(16);
  widget.addSpacer(8);

  let list = [];

  try {
    let req = new Request(API);
    let res = await req.loadJSON();

    list = res?.data?.list || res?.list || [];

  } catch (e) {
    let err = widget.addText("接口异常");
    err.textColor = Color.red();
    return widget;
  }

  let count = 0;

  for (let item of list) {
    let name = item.title || "";
    let episode = item.episode || item.update || "";

    // ===== 订阅过滤 =====
    let matched = FOLLOW.some(k => name.includes(k));
    if (!matched) continue;

    // ===== UI 行 =====
    let row = widget.addStack();
    row.layoutHorizontally();

    let nameText = row.addText(name);
    nameText.font = Font.systemFont(13);

    row.addSpacer();

    let epText = row.addText(episode);
    epText.font = Font.systemFont(12);
    epText.textColor = Color.gray();

    widget.addSpacer(4);

    count++;
    if (count >= MAX) break;
  }

  if (count === 0) {
    let empty = widget.addText("暂无更新");
    empty.textColor = Color.gray();
  }

  return widget;
}

// ===== 运行 =====
let widget = await createWidget();

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium();
}

Script.complete();