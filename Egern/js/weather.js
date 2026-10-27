// Variables used by Scriptable.
// icon-color: blue; icon-glyph: cloud-sun;

const CITY_ID = "101190101";
const CITY_NAME = "南京";
const API_URL = `https://aider.meizu.com/app/weather/listWeather?cityIds=${CITY_ID}`;

const CACHE_KEY = "meizu-weather-nanjing-7day.json";
const CACHE_MAX_AGE = 30 * 60;
const FORECAST_DAYS = 7;

const ICON_MAP = {
  "0": "sun.max.fill",
  "1": "cloud.sun.fill",
  "2": "cloud.fill",
  "3": "cloud.rain.fill",
  "4": "cloud.bolt.rain.fill",
  "5": "sun.haze.fill",
  "6": "cloud.snow.fill",
  "7": "cloud.fog.fill",
  "8": "cloud.drizzle.fill",
  "9": "wind",
  "10": "cloud.sleet.fill"
};

const FALLBACK_DATA = {
  city: CITY_NAME,
  realtime: {
    temp: "29",
    weather: "多云",
    icon: "1",
    feel: "31",
    humidity: "68",
    wind: "东南风 3级",
    aqi: "58",
    quality: "良"
  },
  weathers: [
    { week: "今天", weather: "多云", temp_day_c: "31", temp_night_c: "25", icon: "1" },
    { week: "明天", weather: "小雨", temp_day_c: "29", temp_night_c: "24", icon: "3" },
    { week: "后天", weather: "晴", temp_day_c: "33", temp_night_c: "26", icon: "0" },
    { week: "周五", weather: "阴", temp_day_c: "30", temp_night_c: "25", icon: "2" },
    { week: "周六", weather: "雷阵雨", temp_day_c: "28", temp_night_c: "24", icon: "4" },
    { week: "周日", weather: "多云", temp_day_c: "30", temp_night_c: "25", icon: "1" },
    { week: "周一", weather: "晴", temp_day_c: "34", temp_night_c: "27", icon: "0" }
  ],
  source: "fallback"
};

const widget = await createWidget();

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentLarge();
}

Script.complete();

async function createWidget() {
  const widget = new ListWidget();
  widget.setPadding(14, 14, 14, 14);
  widget.backgroundGradient = makeBackgroundGradient();
  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

  const weather = await getWeatherData();
  const family = config.widgetFamily || "medium";

  if (family === "small") {
    renderSmall(widget, weather);
  } else if (family === "large") {
    renderLarge(widget, weather);
  } else {
    renderMedium(widget, weather);
  }

  return widget;
}

async function getWeatherData() {
  const fm = FileManager.local();
  const cachePath = fm.joinPath(fm.cacheDirectory(), CACHE_KEY);

  try {
    const req = new Request(API_URL);
    req.timeoutInterval = 8;
    const json = await req.loadJSON();
    const parsed = normalizeWeather(json);
    if (!parsed) throw new Error("Invalid payload");

    fm.writeString(cachePath, JSON.stringify({
      timestamp: Math.floor(Date.now() / 1000),
      data: parsed
    }));

    return parsed;
  } catch (e) {
    if (fm.fileExists(cachePath)) {
      try {
        const cached = JSON.parse(fm.readString(cachePath));
        const age = Math.floor(Date.now() / 1000) - (cached.timestamp || 0);
        if (cached.data && age <= CACHE_MAX_AGE) {
          cached.data.source = "cache";
          return cached.data;
        }
      } catch (_) {}
    }
    return FALLBACK_DATA;
  }
}

function normalizeWeather(payload) {
  const item = payload?.value?.[0];
  if (!item) return null;

  const realtime = item.realtime || item.realTime || {};
  const forecastRaw = item.weathers || item.weatherDetails || item.forecasts || [];

  let forecast = forecastRaw.slice(0, FORECAST_DAYS).map((day, index) => ({
    week: pickFirst(day.week, day.day, day.weekday, defaultWeekLabel(index)),
    weather: str(pickFirst(day.weather, day.info, day.description, "--")),
    temp_day_c: str(pickFirst(day.temp_day_c, day.high, day.day_temp, "--")),
    temp_night_c: str(pickFirst(day.temp_night_c, day.low, day.night_temp, "--")),
    icon: str(pickFirst(day.icon, day.img, "1"))
  }));

  if (!forecast.length) forecast = FALLBACK_DATA.weathers;

  if (forecast.length < FORECAST_DAYS) {
    const copy = [...forecast];
    let i = 0;
    while (copy.length < FORECAST_DAYS) {
      const base = forecast[i % forecast.length] || FALLBACK_DATA.weathers[i % FALLBACK_DATA.weathers.length];
      copy.push({
        week: defaultWeekLabel(copy.length),
        weather: base.weather,
        temp_day_c: base.temp_day_c,
        temp_night_c: base.temp_night_c,
        icon: base.icon
      });
      i++;
    }
    forecast = copy;
  }

  return {
    city: pickFirst(item.city, item.city_name, CITY_NAME),
    realtime: {
      temp: str(pickFirst(realtime.temp, realtime.temperature, realtime.temp_c, "--")),
      weather: str(pickFirst(realtime.weather, realtime.info, "--")),
      icon: str(pickFirst(realtime.icon, realtime.img, "1")),
      feel: str(pickFirst(realtime.feel_temp, realtime.feel, realtime.bodytemp, realtime.temp, "--")),
      humidity: str(pickFirst(realtime.sd, realtime.humidity, "--")).replace("%", ""),
      wind: buildWindText(realtime),
      aqi: str(pickFirst(realtime.aqi, item.aqi, "--")),
      quality: str(pickFirst(realtime.airQuality, realtime.quality, item.quality, "空气一般"))
    },
    weathers: forecast,
    source: "api"
  };
}

function renderSmall(widget, data) {
  const top = widget.addStack();
  top.centerAlignContent();

  const city = top.addText(data.city);
  styleText(city, 13, "medium", 0.96);

  top.addSpacer();

  addBadge(top, data.realtime.quality, "#FFFFFF", 0.16);

  widget.addSpacer(8);

  const center = widget.addStack();
  center.centerAlignContent();
  center.addSpacer();

  const icon = center.addImage(getSymbol(data.realtime.icon));
  icon.imageSize = new Size(30, 30);
  icon.tintColor = Color.white();

  center.addSpacer(8);

  const temp = center.addText(`${safe(data.realtime.temp)}°`);
  temp.font = Font.boldSystemFont(34);
  temp.textColor = Color.white();

  center.addSpacer();

  widget.addSpacer(8);

  const desc = widget.addText(data.realtime.weather);
  styleText(desc, 12, "regular", 0.88);

  widget.addSpacer(4);

  const meta1 = widget.addText(`体感 ${safe(data.realtime.feel)}°`);
  styleText(meta1, 10, "regular", 0.7);

  const meta2 = widget.addText(`湿度 ${safe(data.realtime.humidity)}%  AQI ${safe(data.realtime.aqi)}`);
  styleText(meta2, 10, "regular", 0.7);
}

function renderMedium(widget, data) {
  const header = widget.addStack();
  header.layoutHorizontally();
  header.centerAlignContent();

  const left = header.addStack();
  left.layoutVertically();
  left.size = new Size(120, 0);

  const cityRow = left.addStack();
  cityRow.centerAlignContent();

  const city = cityRow.addText(data.city);
  styleText(city, 14, "medium", 0.96);

  cityRow.addSpacer();
  addBadge(cityRow, data.realtime.quality, "#FFFFFF", 0.16);

  left.addSpacer(8);

  const iconTempRow = left.addStack();
  iconTempRow.centerAlignContent();

  const icon = iconTempRow.addImage(getSymbol(data.realtime.icon));
  icon.imageSize = new Size(34, 34);
  icon.tintColor = Color.white();

  iconTempRow.addSpacer(8);

  const temp = iconTempRow.addText(`${safe(data.realtime.temp)}°`);
  temp.font = Font.boldSystemFont(34);
  temp.textColor = Color.white();

  left.addSpacer(6);

  const desc = left.addText(data.realtime.weather);
  styleText(desc, 12, "regular", 0.82);

  left.addSpacer(8);

  const metric1 = left.addText(`体感 ${safe(data.realtime.feel)}°`);
  styleText(metric1, 10, "regular", 0.68);

  const metric2 = left.addText(`湿度 ${safe(data.realtime.humidity)}%`);
  styleText(metric2, 10, "regular", 0.68);

  const metric3 = left.addText(`AQI ${safe(data.realtime.aqi)}`);
  styleText(metric3, 10, "regular", 0.68);

  header.addSpacer(12);

  const right = header.addStack();
  right.layoutVertically();
  right.spacing = 6;

  const title = right.addText("未来 7 天");
  styleText(title, 11, "medium", 0.64);

  right.addSpacer(2);

  data.weathers.slice(0, 5).forEach(day => {
    const row = right.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();

    const week = row.addText(shortWeek(day.week));
    styleText(week, 11, "medium", 0.92);

    row.addSpacer();

    const dIcon = row.addImage(getSymbol(day.icon));
    dIcon.imageSize = new Size(16, 16);
    dIcon.tintColor = new Color("#F7FBFF");

    row.addSpacer(5);

    const range = row.addText(`${safe(day.temp_night_c)}°/${safe(day.temp_day_c)}°`);
    styleText(range, 11, "regular", 0.86);
  });

  widget.addSpacer(10);

  const bottom = widget.addStack();
  bottom.layoutHorizontally();
  bottom.centerAlignContent();

  addMiniMetric(bottom, "风力", compactWind(data.realtime.wind));
  bottom.addSpacer(6);
  addMiniMetric(bottom, "来源", sourceLabel(data.source));
  bottom.addSpacer(6);
  addMiniMetric(bottom, "湿度", `${safe(data.realtime.humidity)}%`);
}

function renderLarge(widget, data) {
  const top = widget.addStack();
  top.layoutHorizontally();

  const current = top.addStack();
  current.layoutVertically();
  current.size = new Size(140, 0);

  const cityRow = current.addStack();
  cityRow.centerAlignContent();

  const city = cityRow.addText(data.city);
  styleText(city, 16, "medium", 0.96);

  cityRow.addSpacer(8);
  addBadge(cityRow, data.realtime.quality, "#FFFFFF", 0.16);

  current.addSpacer(8);

  const temp = current.addText(`${safe(data.realtime.temp)}°`);
  temp.font = Font.boldSystemFont(56);
  temp.textColor = Color.white();

  current.addSpacer(2);

  const desc = current.addText(data.realtime.weather);
  styleText(desc, 14, "regular", 0.84);

  current.addSpacer(8);

  const info1 = current.addText(`体感 ${safe(data.realtime.feel)}°`);
  styleText(info1, 11, "regular", 0.68);

  const info2 = current.addText(`湿度 ${safe(data.realtime.humidity)}%`);
  styleText(info2, 11, "regular", 0.68);

  const info3 = current.addText(`AQI ${safe(data.realtime.aqi)}`);
  styleText(info3, 11, "regular", 0.68);

  current.addSpacer(8);

  const wind = current.addText(compactWind(data.realtime.wind));
  styleText(wind, 11, "regular", 0.62);
  wind.lineLimit = 1;

  top.addSpacer(12);

  const rightPanel = top.addStack();
  rightPanel.layoutVertically();

  const summaryTitle = rightPanel.addText("本周概览");
  styleText(summaryTitle, 12, "medium", 0.66);

  rightPanel.addSpacer(8);

  const grid1 = rightPanel.addStack();
  grid1.layoutHorizontally();
  addMetricCard(grid1, "最高", `${getMaxTemp(data.weathers)}°`);
  grid1.addSpacer(8);
  addMetricCard(grid1, "最低", `${getMinTemp(data.weathers)}°`);

  rightPanel.addSpacer(8);

  const grid2 = rightPanel.addStack();
  grid2.layoutHorizontally();
  addMetricCard(grid2, "AQI", safe(data.realtime.aqi));
  grid2.addSpacer(8);
  addMetricCard(grid2, "湿度", `${safe(data.realtime.humidity)}%`);

  rightPanel.addSpacer(8);

  const grid3 = rightPanel.addStack();
  grid3.layoutHorizontally();
  addMetricCard(grid3, "体感", `${safe(data.realtime.feel)}°`);
  grid3.addSpacer(8);
  addMetricCard(grid3, "来源", sourceLabel(data.source));

  widget.addSpacer(12);

  const divider = widget.addStack();
  divider.size = new Size(0, 1);
  divider.backgroundColor = new Color("#FFFFFF", 0.16);

  widget.addSpacer(10);

  const titleRow = widget.addStack();
  titleRow.layoutHorizontally();

  const title = titleRow.addText("未来 7 天");
  styleText(title, 12, "medium", 0.66);

  titleRow.addSpacer();

  const hint = titleRow.addText("昼 / 夜");
  styleText(hint, 10, "regular", 0.46);

  widget.addSpacer(8);

  const list = widget.addStack();
  list.layoutVertically();
  list.spacing = 6;

  data.weathers.slice(0, 7).forEach(day => {
    const row = list.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();

    const week = row.addText(padWeek(day.week));
    styleText(week, 12, "medium", 0.92);

    row.addSpacer();

    const icon = row.addImage(getSymbol(day.icon));
    icon.imageSize = new Size(18, 18);
    icon.tintColor = new Color("#F7FBFF");

    row.addSpacer(8);

    const weather = row.addText(day.weather);
    styleText(weather, 11, "regular", 0.72);
    weather.lineLimit = 1;
    weather.minimumScaleFactor = 0.7;

    row.addSpacer();

    const range = row.addText(`${safe(day.temp_day_c)}° / ${safe(day.temp_night_c)}°`);
    styleText(range, 12, "regular", 0.88);
  });
}

function addMetricCard(parent, label, value) {
  const card = parent.addStack();
  card.layoutVertically();
  card.backgroundColor = new Color("#FFFFFF", 0.12);
  card.cornerRadius = 10;
  card.setPadding(7, 10, 7, 10);
  card.size = new Size(72, 52);

  const labelText = card.addText(label);
  styleText(labelText, 10, "regular", 0.58);

  card.addSpacer(4);

  const valueText = card.addText(value);
  styleText(valueText, 13, "medium", 0.94);
  valueText.lineLimit = 1;
  valueText.minimumScaleFactor = 0.7;
}

function addMiniMetric(parent, label, value) {
  const chip = parent.addStack();
  chip.backgroundColor = new Color("#FFFFFF", 0.12);
  chip.cornerRadius = 8;
  chip.setPadding(4, 6, 4, 6);

  const text = chip.addText(`${label} ${value}`);
  styleText(text, 10, "regular", 0.78);
  text.lineLimit = 1;
  text.minimumScaleFactor = 0.7;
}

function addBadge(parent, text, colorHex, bgAlpha) {
  const badge = parent.addStack();
  badge.backgroundColor = new Color(colorHex, bgAlpha);
  badge.cornerRadius = 8;
  badge.setPadding(3, 7, 3, 7);

  const label = badge.addText(text || "--");
  label.font = Font.mediumSystemFont(10);
  label.textColor = Color.white();
  label.lineLimit = 1;
  label.minimumScaleFactor = 0.7;

  return badge;
}

function makeBackgroundGradient() {
  const gradient = new LinearGradient();
  gradient.locations = [0, 0.42, 1];
  gradient.colors = [
    new Color("#4A6CF7"),
    new Color("#7B61FF"),
    new Color("#FF8A5B")
  ];
  return gradient;
}

function getSymbol(code) {
  const name = ICON_MAP[String(code)] || "cloud.sun.fill";
  return SFSymbol.named(name).image;
}

function styleText(textItem, size, weight, opacity) {
  if (weight === "bold") textItem.font = Font.boldSystemFont(size);
  else if (weight === "medium") textItem.font = Font.mediumSystemFont(size);
  else textItem.font = Font.systemFont(size);

  textItem.textColor = Color.white();
  textItem.textOpacity = opacity;
}

function buildWindText(realtime) {
  const dir = str(pickFirst(realtime.wd, realtime.wind_dir, realtime.windDirection, "微风"));
  const level = str(pickFirst(realtime.ws, realtime.wind_power, realtime.wind_level, ""));
  return `${dir}${level ? " " + level : ""}`;
}

function compactWind(text) {
  return safe(text).replace(/\s+/g, "");
}

function getMaxTemp(days) {
  const values = days.map(i => parseInt(i.temp_day_c, 10)).filter(i => !isNaN(i));
  if (!values.length) return "--";
  return Math.max(...values);
}

function getMinTemp(days) {
  const values = days.map(i => parseInt(i.temp_night_c, 10)).filter(i => !isNaN(i));
  if (!values.length) return "--";
  return Math.min(...values);
}

function shortWeek(week) {
  if (!week) return "--";
  return String(week).replace("星期", "周");
}

function padWeek(week) {
  return shortWeek(week);
}

function pickFirst() {
  for (let i = 0; i < arguments.length; i++) {
    const v = arguments[i];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function defaultWeekLabel(index) {
  const labels = ["今天", "明天", "后天", "周五", "周六", "周日", "周一"];
  return labels[index] || `第${index + 1}天`;
}

function sourceLabel(source) {
  if (source === "api") return "魅族天气";
  if (source === "cache") return "缓存";
  return "离线";
}

function safe(value) {
  if (value === undefined || value === null || value === "") return "--";
  return String(value);
}

function str(value) {
  return value === undefined || value === null ? "--" : String(value);
