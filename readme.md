# tcp-hookshot

Simple application that captures webhooks and relays them to authorized clients

Uses Passport.js with Discord to handle accounts/signin and SQLite3 to handle data storage because I'm lazy as hell

Check it out @ [https://hook.redshirt.dev](https://hook.redshirt.dev)

At the moment, this only supports TCP for clients, websockets may be used in future updates.

To host this yourself, create a .env file with the following fields
```env
EXPRESS_PORT=3000
TCP_PORT=5000
EXPRESS_SECRET=<EXPRESS_SECRET>
DISCORD_CLIENT_ID=<DISCORD_CLIENT_ID>
DISCORD_CLIENT_SECRET=<DISCORD_CLIENT_SECRET>
DISCORD_CALLBACK_URL=http://localhost:3000/callback
```


To use this, an example client application can be found [here](https://gist.github.com/Sidorakh/349f1082019cb9af16c42f8c9b8825bb), written in Node.js