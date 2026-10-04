const express=require("express");
const path=require("path");
const {Pool}=require("pg");
const bcrypt=require("bcryptjs");
const jwt=require("jsonwebtoken");
const multer=require("multer");
const fs=require("fs");

const app=express(), PORT=process.env.PORT||3000;
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==="production"?{rejectUnauthorized:false}:false});
const JWT_SECRET=process.env.JWT_SECRET||"CHANGE_ME";
const ADMIN_USER=process.env.ADMIN_USER||"admin";
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||"Doncarlos123!";

app.use(express.json({limit:"3mb"})); app.use(express.urlencoded({extended:true}));
app.use(express.static(path.join(__dirname,"public")));

const uploadRoot=path.join(__dirname,"public","uploads");
for(const x of ["teams","players","news"]) fs.mkdirSync(path.join(uploadRoot,x),{recursive:true});
const storage=multer.diskStorage({destination:(r,f,c)=>c(null,path.join(uploadRoot,["player","team","news"].includes(r.params.type)?(r.params.type==="player"?"players":r.params.type==="team"?"teams":"news"):"news")),filename:(r,f,c)=>c(null,Date.now()+"-"+Math.random().toString(36).slice(2)+path.extname(f.originalname).toLowerCase())});
const upload=multer({storage,limits:{fileSize:5*1024*1024},fileFilter:(r,f,c)=>c(null,/^image\/(png|jpeg|webp|gif)$/.test(f.mimetype))});
async function q(s,p=[]){return (await pool.query(s,p)).rows}
function auth(r,s,n){try{r.admin=jwt.verify((r.headers.authorization||"").replace("Bearer ",""),JWT_SECRET);n()}catch(e){s.status(401).json({error:"No autorizado"})}}
function roles(...rs){return (r,s,n)=>rs.includes(r.admin?.role)?n():s.status(403).json({error:"Permisos insuficientes"})}
function sign(a){return jwt.sign({id:a.id,username:a.username,role:a.role},JWT_SECRET,{expiresIn:"12h"})}
function schedule(ids){let a=[...ids],rs=[],n=a.length;for(let r=0;r<n-1;r++){let g=[];for(let i=0;i<n/2;i++)g.push(r%2?[a[n-1-i],a[i]]:[a[i],a[n-1-i]]);rs.push(g);a=[a[0],a[n-1],...a.slice(1,n-1)]}return [...rs,...rs.map(x=>x.map(([h,v])=>[v,h]))]}
async function init(){
 await q(`CREATE TABLE IF NOT EXISTS admins(id SERIAL PRIMARY KEY,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'superadmin',created_at TIMESTAMPTZ DEFAULT now())`);
 await q(`CREATE TABLE IF NOT EXISTS seasons(id SERIAL PRIMARY KEY,name TEXT NOT NULL,active BOOLEAN DEFAULT false,created_at TIMESTAMPTZ DEFAULT now())`);
 await q(`CREATE TABLE IF NOT EXISTS teams(id SERIAL PRIMARY KEY,season_id INT REFERENCES seasons(id) ON DELETE CASCADE,name TEXT NOT NULL,short_name TEXT,city TEXT,stadium TEXT,shield TEXT,description TEXT,created_at TIMESTAMPTZ DEFAULT now())`);
 await q(`CREATE TABLE IF NOT EXISTS players(id SERIAL PRIMARY KEY,team_id INT REFERENCES teams(id) ON DELETE CASCADE,name TEXT NOT NULL,number INT,position TEXT,birth_year INT,nationality TEXT,photo TEXT,goals INT DEFAULT 0,assists INT DEFAULT 0,yellow INT DEFAULT 0,red INT DEFAULT 0,created_at TIMESTAMPTZ DEFAULT now())`);
 await q(`CREATE TABLE IF NOT EXISTS matches(id SERIAL PRIMARY KEY,season_id INT REFERENCES seasons(id) ON DELETE CASCADE,round INT,home_id INT REFERENCES teams(id) ON DELETE CASCADE,away_id INT REFERENCES teams(id) ON DELETE CASCADE,home_goals INT,away_goals INT,status TEXT DEFAULT 'scheduled',kickoff TIMESTAMPTZ,venue TEXT,stage TEXT DEFAULT 'league',created_at TIMESTAMPTZ DEFAULT now())`);
 await q(`CREATE TABLE IF NOT EXISTS match_events(id SERIAL PRIMARY KEY,match_id INT REFERENCES matches(id) ON DELETE CASCADE,minute INT,type TEXT NOT NULL,player_id INT REFERENCES players(id) ON DELETE SET NULL,team_id INT REFERENCES teams(id) ON DELETE SET NULL,description TEXT,created_at TIMESTAMPTZ DEFAULT now())`);
 await q(`CREATE TABLE IF NOT EXISTS playoffs(id SERIAL PRIMARY KEY,season_id INT REFERENCES seasons(id) ON DELETE CASCADE,stage TEXT NOT NULL,home_team_id INT REFERENCES teams(id),away_team_id INT REFERENCES teams(id),home_goals INT,away_goals INT,winner_team_id INT REFERENCES teams(id),match_date TIMESTAMPTZ,status TEXT DEFAULT 'scheduled')`);
 await q(`CREATE TABLE IF NOT EXISTS news(id SERIAL PRIMARY KEY,season_id INT REFERENCES seasons(id) ON DELETE CASCADE,title TEXT NOT NULL,body TEXT NOT NULL,image TEXT,created_at TIMESTAMPTZ DEFAULT now())`);
 await q(`CREATE TABLE IF NOT EXISTS twitch_settings(id INT PRIMARY KEY DEFAULT 1,channel TEXT,enabled BOOLEAN DEFAULT false,client_id TEXT,redirect_uri TEXT)`);
 let a=await q("SELECT * FROM admins LIMIT 1"); if(!a.length) await q("INSERT INTO admins(username,password_hash,role) VALUES($1,$2,'superadmin')",[ADMIN_USER,await bcrypt.hash(ADMIN_PASSWORD,10)]);
 let s=await q("SELECT * FROM seasons ORDER BY id LIMIT 1"); if(!s.length){let z=(await q("INSERT INTO seasons(name,active) VALUES('Temporada 1',true) RETURNING *"))[0];for(let i=1;i<=12;i++)await q("INSERT INTO teams(season_id,name,short_name) VALUES($1,$2,$3)",[z.id,"Equipo "+i,"E"+i]);let ts=await q("SELECT id FROM teams WHERE season_id=$1 ORDER BY id",[z.id]);for(let r=0;r<22;r++)for(const [h,v] of schedule(ts.map(x=>x.id))[r])await q("INSERT INTO matches(season_id,round,home_id,away_id) VALUES($1,$2,$3,$4)",[z.id,r+1,h,v])}
}
async function state(){
 let seasons=await q("SELECT * FROM seasons ORDER BY id DESC"),active=seasons.find(x=>x.active)||seasons[0];
 if(!active)return{seasons,active:null,teams:[],players:[],matches:[],events:[],playoffs:[],news:[]};
 let teams=await q("SELECT * FROM teams WHERE season_id=$1 ORDER BY name",[active.id]);
 let players=await q(`SELECT p.*,t.name team_name FROM players p JOIN teams t ON t.id=p.team_id WHERE t.season_id=$1 ORDER BY p.goals DESC,p.name`,[active.id]);
 let matches=await q(`SELECT m.*,h.name home_name,a.name away_name FROM matches m JOIN teams h ON h.id=m.home_id JOIN teams a ON a.id=m.away_id WHERE m.season_id=$1 ORDER BY m.round,m.id`,[active.id]);
 let events=await q(`SELECT e.*,p.name player_name,t.name team_name FROM match_events e LEFT JOIN players p ON p.id=e.player_id LEFT JOIN teams t ON t.id=e.team_id WHERE e.match_id IN (SELECT id FROM matches WHERE season_id=$1) ORDER BY e.match_id,e.minute,e.id`,[active.id]);
 let playoffs=await q(`SELECT p.*,h.name home_name,a.name away_name,w.name winner_name FROM playoffs p LEFT JOIN teams h ON h.id=p.home_team_id LEFT JOIN teams a ON a.id=p.away_team_id LEFT JOIN teams w ON w.id=p.winner_team_id WHERE p.season_id=$1 ORDER BY p.id`,[active.id]);
 let news=await q("SELECT * FROM news WHERE season_id=$1 ORDER BY id DESC",[active.id]);
 return{seasons,active,teams,players,matches,events,playoffs,news}
}
app.get("/api/health",(r,s)=>s.json({ok:true,version:"5.0"}));
app.post("/api/auth/login",async(r,s)=>{let a=(await q("SELECT * FROM admins WHERE username=$1",[r.body.username||""]))[0];if(!a||!(await bcrypt.compare(r.body.password||"",a.password_hash)))return s.status(401).json({error:"Usuario o contraseña incorrectos"});s.json({token:sign(a),admin:{id:a.id,username:a.username,role:a.role}})});
app.get("/api/state",async(r,s)=>s.json(await state()));

app.post("/api/seasons",auth,roles("superadmin","admin"),async(r,s)=>{let name=(r.body.name||"").trim()||"Temporada "+(await q("SELECT count(*) c FROM seasons"))[0].c;await q("UPDATE seasons SET active=false");let z=(await q("INSERT INTO seasons(name,active) VALUES($1,true) RETURNING *",[name]))[0];for(let i=1;i<=12;i++)await q("INSERT INTO teams(season_id,name,short_name) VALUES($1,$2,$3)",[z.id,"Equipo "+i,"E"+i]);let ts=await q("SELECT id FROM teams WHERE season_id=$1 ORDER BY id",[z.id]);for(let r=0;r<22;r++)for(const[h,v]of schedule(ts.map(x=>x.id))[r])await q("INSERT INTO matches(season_id,round,home_id,away_id) VALUES($1,$2,$3,$4)",[z.id,r+1,h,v]);s.json(z)});
app.put("/api/seasons/:id/activate",auth,roles("superadmin","admin"),async(r,s)=>{await q("UPDATE seasons SET active=false");await q("UPDATE seasons SET active=true WHERE id=$1",[r.params.id]);s.json({ok:true})});

app.post("/api/teams",auth,roles("superadmin","admin"),async(r,s)=>{let z=(await q("SELECT id FROM seasons WHERE active=true LIMIT 1"))[0];s.json((await q("INSERT INTO teams(season_id,name,short_name,city,stadium,description) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",[z.id,r.body.name,r.body.short_name,r.body.city,r.body.stadium,r.body.description]))[0])});
app.put("/api/teams/:id",auth,roles("superadmin","admin","editor"),async(r,s)=>{let b=r.body;s.json((await q("UPDATE teams SET name=COALESCE($1,name),short_name=COALESCE($2,short_name),city=COALESCE($3,city),stadium=COALESCE($4,stadium),description=COALESCE($5,description) WHERE id=$6 RETURNING *",[b.name,b.short_name,b.city,b.stadium,b.description,r.params.id]))[0])});
app.delete("/api/teams/:id",auth,roles("superadmin"),async(r,s)=>{await q("DELETE FROM teams WHERE id=$1",[r.params.id]);s.json({ok:true})});

app.post("/api/players",auth,roles("superadmin","admin","editor"),async(r,s)=>{let b=r.body;s.json((await q("INSERT INTO players(team_id,name,number,position,birth_year,nationality) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",[b.team_id,b.name,b.number||null,b.position||"",b.birth_year||null,b.nationality||""]))[0])});
app.put("/api/players/:id",auth,roles("superadmin","admin","editor"),async(r,s)=>{let b=r.body;s.json((await q(`UPDATE players SET team_id=COALESCE($1,team_id),name=COALESCE($2,name),number=COALESCE($3,number),position=COALESCE($4,position),birth_year=COALESCE($5,birth_year),nationality=COALESCE($6,nationality),goals=COALESCE($7,goals),assists=COALESCE($8,assists),yellow=COALESCE($9,yellow),red=COALESCE($10,red) WHERE id=$11 RETURNING *`,[b.team_id,b.name,b.number,b.position,b.birth_year,b.nationality,b.goals,b.assists,b.yellow,b.red,r.params.id]))[0])});
app.delete("/api/players/:id",auth,roles("superadmin","admin"),async(r,s)=>{await q("DELETE FROM players WHERE id=$1",[r.params.id]);s.json({ok:true})});

app.put("/api/matches/:id",auth,roles("superadmin","admin","editor"),async(r,s)=>{let b=r.body;s.json((await q("UPDATE matches SET home_goals=$1,away_goals=$2,status=$3,kickoff=$4,venue=$5 WHERE id=$6 RETURNING *",[b.home_goals??null,b.away_goals??null,b.status||"played",b.kickoff||null,b.venue||null,r.params.id]))[0])});
app.post("/api/matches/:id/events",auth,roles("superadmin","admin","editor"),async(r,s)=>{let b=r.body;s.json((await q("INSERT INTO match_events(match_id,minute,type,player_id,team_id,description) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",[r.params.id,b.minute||0,b.type,b.player_id||null,b.team_id||null,b.description||""]))[0])});
app.delete("/api/events/:id",auth,roles("superadmin","admin","editor"),async(r,s)=>{await q("DELETE FROM match_events WHERE id=$1",[r.params.id]);s.json({ok:true})});

app.post("/api/playoffs",auth,roles("superadmin","admin"),async(r,s)=>{let z=(await q("SELECT id FROM seasons WHERE active=true LIMIT 1"))[0],b=r.body;s.json((await q("INSERT INTO playoffs(season_id,stage,home_team_id,away_team_id,match_date) VALUES($1,$2,$3,$4,$5) RETURNING *",[z.id,b.stage,b.home_team_id||null,b.away_team_id||null,b.match_date||null]))[0])});
app.put("/api/playoffs/:id",auth,roles("superadmin","admin","editor"),async(r,s)=>{let b=r.body;s.json((await q("UPDATE playoffs SET home_goals=$1,away_goals=$2,winner_team_id=$3,status=$4 WHERE id=$5 RETURNING *",[b.home_goals??null,b.away_goals??null,b.winner_team_id||null,b.status||"played",r.params.id]))[0])});

app.post("/api/news",auth,roles("superadmin","admin","editor"),async(r,s)=>{let z=(await q("SELECT id FROM seasons WHERE active=true LIMIT 1"))[0];s.json((await q("INSERT INTO news(season_id,title,body) VALUES($1,$2,$3) RETURNING *",[z.id,r.body.title,r.body.body]))[0])});
app.delete("/api/news/:id",auth,roles("superadmin","admin"),async(r,s)=>{await q("DELETE FROM news WHERE id=$1",[r.params.id]);s.json({ok:true})});

app.post("/api/upload/:type/:id",auth,roles("superadmin","admin","editor"),upload.single("image"),async(r,s)=>{if(!r.file)return s.status(400).json({error:"Imagen inválida"});let map={team:["teams","shield"],player:["players","photo"],news:["news","image"]},m=map[r.params.type];if(!m)return s.status(400).json({error:"Tipo inválido"});let url="/uploads/"+m[0]+"/"+r.file.filename;await q(`UPDATE ${m[0]} SET ${m[1]}=$1 WHERE id=$2`,[url,r.params.id]);s.json({url})});

app.get("/api/twitch",async(r,s)=>s.json((await q("SELECT channel,enabled,client_id,redirect_uri FROM twitch_settings WHERE id=1"))[0]||{channel:"",enabled:false}));
app.put("/api/twitch",auth,roles("superadmin","admin"),async(r,s)=>{let b=r.body;await q(`INSERT INTO twitch_settings(id,channel,enabled,client_id,redirect_uri) VALUES(1,$1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET channel=$1,enabled=$2,client_id=$3,redirect_uri=$4`,[b.channel||"",!!b.enabled,b.client_id||"",b.redirect_uri||""]);s.json({ok:true})});

app.get("*",(r,s)=>s.sendFile(path.join(__dirname,"public","index.html")));
init().then(()=>app.listen(PORT,()=>console.log("Doncarlos League V5 "+PORT))).catch(e=>{console.error(e);process.exit(1)});
