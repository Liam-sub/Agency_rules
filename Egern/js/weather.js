/**
 * Egern Widget - TMDB 追剧更新
 * 尺寸：4x2
 */

const API_KEY = "92e05285c9b611b728e963fc7f3bb96b";

const SHOWS = [
  { id: 222766, name: "豺狼的日子", category: "🇺🇸 美剧"},
  { id: 106379, name: "辐射", category: "🇺🇸 美剧"},
  { id: 126308, name: "幕府将军", category: "🇺🇸 美剧"},
  { id: 101172, name: "吞噬星空", category: "🇨🇳 国漫"},
  { id: 67063, name: "一人之下", category: "🇨🇳 国漫"},
  { id: 91097, name: "灵笼", category: "🇨🇳 国漫"},
  { id: 30984, name: "死神：千年血战", category: "🇯🇵 日漫"},
  { id: 207468, name: "怪兽8号", category: "🇯🇵 日漫"},
  { id: 217553, name: "外伤重症中心", category: "🇰🇷 韩剧"}
];

const DAYS = 7;

const today = new Date().toISOString().slice(0,10);

function fetchShow(id){
  return new Promise((resolve,reject)=>{

    const url = `https://api.themoviedb.org/3/tv/${id}?api_key=${API_KEY}&language=zh-CN`;

    $httpClient.get(url,(err,res,data)=>{
      if(err) reject(err);
      else resolve(JSON.parse(data));
    });

  });
}

Promise.all(SHOWS.map(i=>fetchShow(i.id))).then(list=>{

  let todayUpdate=[];
  let upcoming=[];

  list.forEach((show,i)=>{

    const meta = SHOWS[i];

    if(show.last_air_date===today && show.last_episode_to_air){

      todayUpdate.push({
        name:meta.name,
        ep:show.last_episode_to_air.episode_number
      });

    }

    if(show.next_episode_to_air){

      const ep = show.next_episode_to_air;
      const diff = Math.ceil(
        (new Date(ep.air_date)-new Date(today))/86400000
      );

      if(diff>0 && diff<=DAYS){

        upcoming.push({
          name:meta.name,
          day:diff
        });

      }
    }

  });

  upcoming.sort((a,b)=>a.day-b.day);

  render(todayUpdate,upcoming);

}).catch(err=>{
  renderError(String(err));
});

function render(todayUpdate,upcoming){

  const list=[];

  todayUpdate.slice(0,2).forEach(i=>{
    list.push(`🆕 ${i.name} E${i.ep}`);
  });

  upcoming.slice(0,3).forEach(i=>{
    const t = i.day===1 ? "明天" : `${i.day}天`;
    list.push(`📅 ${i.name} ${t}`);
  });

  const widget = Widget(
    {padding:16},

    VStack(

      HStack(
        Text("📺 追剧更新").font(16).bold(),
        Spacer(),
        Text(`${todayUpdate.length+upcoming.length}`)
      ),

      Spacer(8),

      ...list.map(i=>Text(i).font(13))

    )

  );

  $done(widget);

}

function renderError(msg){

  const widget = Widget(
    {padding:16},
    VStack(
      Text("📺 追剧").font(16).bold(),
      Spacer(6),
      Text("加载失败"),
      Text(msg).font(10)
    )
  );

  $done(widget);

}