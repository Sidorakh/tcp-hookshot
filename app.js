require('dotenv').config();
const express = require('express');
const body_parser = require('body-parser');
const Database = require('better-sqlite3');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const net = require('net');
const db = new Database('hooks.db');
const discord_scopes = ['identify', 'email'];
const uuid = require('uuid');
const crypto = require('crypto');

const connected_clients = {};
passport.use(new DiscordStrategy({
        clientID:process.env.DISCORD_CLIENT_ID,
        clientSecret:process.env.DISCORD_CLIENT_SECRET,
        callbackURL:process.env.DISCORD_CALLBACK_URL,
        scopes:discord_scopes
    },(access_token, refresh_token, profile, done)=>{
        return done(null,profile);
    }
));
passport.serializeUser((user,done)=>{
    db.prepare(`INSERT OR IGNORE INTO UserSessions(UserID,SessionData) VALUES (?,?)`).run(user.id,JSON.stringify(user));
    db.prepare(`UPDATE UserSessions SET SessionData=(?) WHERE UserID=(?)`).run(user.id,JSON.stringify(user));
    
    done(null,user);
});
passport.deserializeUser((user,done)=>{
    const stmt = db.prepare(`SELECT * FROM UserSessions WHERE UserID=?`);
    const session = stmt.get(user.id);
    if (session==undefined) {
        return done(null,false);
    }
    done(null,JSON.parse(session.SessionData));
})

const app = express();
app.set('view engine','ejs');
app.use(body_parser.urlencoded({extended:false}));
app.use(session({secret:process.env.EXPRESS_SECRET,resave:false,saveUninitialized:false}));
app.use(body_parser.json());
app.use(passport.initialize());
app.use(passport.session());
app.use('/assets',express.static('./assets'));

// app.get('*',(req,res,next)=>{
//     console.log(req.originalUrl);
//     next();
// });

app.get('/',(req,res)=>{
    render(req,res,'home',{title:'Home'})
});
app.get('/login',passport.authenticate('discord',{scope:['identify', 'email']}));
app.get('/callback',passport.authenticate('discord',{failureRedirect:'/',successRedirect:'/dashboard'}));
app.get('/dashboard',check_auth,(req,res)=>{
    const hooks = db.prepare(`SELECT * FROM Webhooks WHERE UserID=(?)`).all(req.user.id);
    render(req,res,'dashboard',{title:'Dashboard',webhooks:hooks});
});
app.post('/dashboard/create-hook',check_auth,(req,res)=>{
    const webhook_id = uuid.v4();
    const webhook_secret = crypto.randomBytes(32).toString('base64');
    const stmt = db.prepare(`INSERT INTO Webhooks (WebhookID, WebhookName, UserID, WebhookToken) VALUES (?,?,?,?)`);
    stmt.run(webhook_id,req.body.name,req.user.id,webhook_secret);
    res.redirect(`/dashboard?#webhook-${webhook_id}`);
});




app.all('/hook/:owner_id/:hook_id',(req,res)=>{
    const owner_id = req.params.owner_id;
    const hook_id = req.params.hook_id;
    const stmt = db.prepare(`SELECT * FROM Webhooks WHERE WebhookID=(?) AND UserID=(?)`);
    const hook = stmt.get(hook_id,owner_id);
    if (hook == undefined) {
        return res.status(400).send(`Webhook not found`);
    }
    res.send('received');
    webhook_broadcast(hook_id,JSON.stringify({
        method:req.method,
        headers:req.header,
        body:req.body,
        query:req.query,
        name:hook.WebhookName
    }));
});


function check_auth(req,res,next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/');
}

function render(req,res,page,data={}) {
    const options = Object.assign({page:page,title:'',query:req.query,user:req.user,hostname:req.hostname},data);
    res.render('page',options);
}

(()=>{
    // Database setup
    db.prepare(`CREATE TABLE IF NOT EXISTS UserSessions (UserID TEXT PRIMARY KEY, SessionData TEXT NOT NULL)`).run();
    db.prepare(`CREATE TABLE IF NOT EXISTS Users (UserID TEXT PRIMARY KEY, DisplayName TEXT NOT NULL)`).run();
    db.prepare(`CREATE TABLE IF NOT EXISTS Webhooks (WebhookID TEXT PRIMARY KEY, WebhookName TEXT NOT NULL, UserID TEXT NOT NULL, WebhookToken TEXT NOT NULL)`).run();

})();

app.listen(process.env.EXPRESS_PORT);

const server = net.createServer((sock)=>{
    sock.uuid = uuid.v4();
    sock.ready = false;
    sock.on('data',(buff)=>{    // packet types: init, keepalive
        let packet = buff.toString();
        packet = JSON.parse(packet);
        //console.log(packet);
        switch (packet.type) {
            case 'init':
                if(sock.ready==false) {
                    const stmt = db.prepare(`SELECT * FROM Webhooks WHERE WebhookID=(?) AND WebhookToken=(?)`);
                    const hook = stmt.get(packet.hook_id,packet.secret_key);
                    if (hook) {
                        sock.ready = true;
                        sock.webhook = hook.WebhookID;
                        console.log('we got a client!');
                        register_client(hook.WebhookID,sock);
                        sock.ready = true;
                    } else {
                        sock.destroy();
                    }
                }

            break;
            case 'keepalive':
                sock.write(JSON.stringify({
                    type:'keepalive',
                    time:Date.now()
                }));
            break;
        }
    });
    sock.on('error',()=>{
        console.log('Error found on client - disconnecting');
        sock.destroy();
    });
});

function register_client(hook_id,client) {
    if (connected_clients[hook_id]==undefined) {
        connected_clients[hook_id] = {};
    }
    const hook = connected_clients[hook_id];
    hook[client.uuid] = client;
}

function unregister_client(hook_id,client) {
    if (connected_clients[hook_id]==undefined) {
        return;
    }
    const hook = connected_clients[hook_id];
    delete hook[client.uuid];
}

function webhook_broadcast(hook_id,data) {
    if (connected_clients[hook_id]==undefined) {
        return;
    }
    const hook = connected_clients[hook_id];
    for (const id of Object.keys(hook)) {
        try {
            hook[id].write(data);
        } catch(e) {
            // meh
        }
    }
}

server.listen(process.env.TCP_PORT);