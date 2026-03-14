const params = getParams($argument || "");
const cityId = params.cityId || "101190401";

const apiUrl = `http://t.weather.sojson.com/api/weather/city/${cityId}`;

$httpClient.get(apiUrl, (error, response, data) => {

  if (error || !data) {
    render(errorView("天气获取失败"));
    return;
  }

  try {

    const weatherData = JSON.parse(data);

    if (weatherData.status !== 200) {
      render(errorView("接口返回异常"));
      return;
    }

    const cityInfo = weatherData.cityInfo;
    const today = weatherData.data.forecast[0];

    const city = cityInfo.city;
    const weather = today.type;
    const temp = `${today.low} ${today.high}`;
    const humidity = weatherData.data.shidu;
    const quality = weatherData.data.quality;
    const wind = `${today.fx} ${today.fl}`;
    const sunrise = today.sunrise;
    const sunset = today.sunset;

    render(
      Widget(
        { padding: 16 },

        VStack(

          HStack(
            Text(`📍 ${city}`).font(16).bold(),
            Spacer(),
            Text(weather).font(16)
          ),

          Spacer(8),

          Text(`🌡 ${temp}`)
            .font(24)
            .bold(),

          Spacer(6),

          HStack(
            Text(`💧 ${humidity}`),
            Spacer(),
            Text(`🌬 ${quality}`)
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

    render(errorView("解析天气失败"));

  }

});

function getParams(param) {
  if (!param) return {};
  return Object.fromEntries(
    param
      .split("&")
      .map(i => i.split("="))
      .map(([k, v]) => [k, decodeURIComponent(v)])
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