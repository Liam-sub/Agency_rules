/*
Quantumult X - 豆包去水印（稳定版）
*/

let body = $response.body;

// 全局匹配高清资源
const regex =
  /https?:\/\/[^"'\\]+?\.(png|jpg|jpeg|webp|mp4)(\?[^"'\\]*)?/gi;

let matches = body.match(regex);

if (matches && matches.length > 0) {
  // 取最长的一般是原图
  matches.sort((a, b) => b.length - a.length);
  const url = matches[0];

  $notify("豆包去水印成功", "点击打开原图/视频", url);
} else {
  $notify("豆包未找到原始资源", "可能接口已变化", "");
}

$done({});