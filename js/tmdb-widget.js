export default async function(ctx) {

  const today = new Date().toISOString().slice(0,10);

  const updated = [];
  const upcoming = [];

  const requests = SHOWS.map(s =>
    httpGet(`https://api.themoviedb.org/3/tv/${s.id}`)
      .then(body => ({meta:s,body}))
  );

  const results = await Promise.all(requests);

  results.forEach(r=>{
    if(!r.body) return;

    const show = JSON.parse(r.body);

    if(show.last_air_date===today){
      updated.push(show.name);
    }

    if(show.next_episode_to_air){
      upcoming.push(show.name);
    }
  });

  return {
    type:"widget",
    padding:16,
    children:[
      {
        type:"text",
        text:"📺 追剧更新",
        font:{size:"headline",weight:"bold"}
      },

      {type:"spacer",size:8},

      ...updated.slice(0,3).map(x=>({
        type:"text",
        text:`🆕 ${x}`
      })),

      {type:"spacer",size:6},

      ...upcoming.slice(0,3).map(x=>({
        type:"text",
        text:`⏰ ${x}`
      }))
    ]
  };

}
