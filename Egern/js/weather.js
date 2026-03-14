const params = getParams($argument || "");
const cityId = params.cityId || "101190401";

const apiUrl = `http://t.weather.sojson.com/api/weather/city/${cityId}`;

$httpClient.get(apiUrl, (error, response, data) => {

  if (error) {
    render(errorView("天气获取失败"));
    return;
  }

  const weatherData = JSON.parse(data);

  const city = weatherData.cityInfo.city;
  const today = weatherData.data.forecast[0];

  const temp = `${today.low} ${today.high}`;
  const wind = `${today.fx} ${today.fl}`;
  const humidity = weatherData.data.shidu;
  const quality = weatherData.data.quality;

  render(
    Widget(
      {
        padding: 16
      },

      VStack(

        HStack(
          Text(`📍 ${city}`).font(16).bold(),
          Spacer(),
          Text(today.type).font(16)
        ),

        Spacer(6),

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
          Text(`🌅 ${today.sunrise}`),
          Spacer(),
          Text(`🌇 ${today.sunset}`)
        )

      )
    )
  );

});


function getParams(param) {
  if (!param) return {};
  return Object.fromEntries(
    param.split("&").map(i => i.split("=")).map(([k,v]) => [k,decodeURIComponent(v)])
  );
}


function errorView(msg){
  return Widget(
    {},
    VStack(
      Text("天气"),
      Spacer(8),
      Text(msg)
    )
  );
}