const params = getParams($argument || "");
const city = params.city || "nanjing";

// 魅族天气 API
const api = `https://aider.meizu.com/app/weather/listWeather?cityIds=${city}`;

$httpClient.get(api, (err, resp, data) => {

  if (err || !data) {
    render(errorView("天气获取失败"));
    return;
  }

  try {

    const json = JSON.parse(data);

    if (!json.value || !json.value[0]) {
      render(errorView("天气数据为空"));
      return;
    }

    const weather = json.value[0];

    const cityName = weather.city;
    const realtime = weather.realtime;
    const today = weather.weathers[0];

    const temp = `${realtime.temp}℃`;
    const weatherText = realtime.weather;
    const wind = `${realtime.wD} ${realtime.wS}`;
    const humidity = `${realtime.sD}%`;
    const air = realtime.aqi;

    const highLow = `${today.temperature}`;
    const sunrise = today.sunrise;
    const sunset = today.sunset;

    render(
      Widget(
        { padding: 16 },

        VStack(

          HStack(
            Text(`📍 ${cityName}`).font(16).bold(),
            Spacer(),
            Text(weatherText).font(16)
          ),

          Spacer(8),

          Text(`🌡 ${temp}`)
            .font(26)
            .bold(),

          Spacer(6),

          Text(`今日 ${highLow}`)
            .font(14),

          Spacer(6),

          HStack(
            Text(`💧 ${humidity}`),
            Spacer(),
            Text(`🌬 AQI ${air}`)
          ),

          Spacer(6),

          Text(`🪁 ${wind}`),

          Spacer(6),

          HStack(
            Text(`🌅 ${sunrise}`),
            Spacer(),
            Text(`🌇 ${sunset}`)
          )

        )
      )
    );

  } catch (e) {

    render(errorView("解析失败"));

  }

});

function getParams(param) {
  if (!param) return {};
  return Object.fromEntries(
    param
      .split("&")
      .map(i => i.split("="))
      .map(([k,v]) => [k, decodeURIComponent(v)])
  );
}

function errorView(msg){
  return Widget(
    { padding: 16 },
    VStack(
      Text("天气").font(18).bold(),
      Spacer(8),
      Text(msg)
    )
  );
}