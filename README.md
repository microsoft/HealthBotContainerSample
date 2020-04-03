# Health Bot Container

**Note:** In order to use this Web Chat with the Health Bot service, you will need to obtain your Web Chat secret by going to ["Integration/Secrets"](./secrets.png) on the navigation panel.
Please refer to [Microsoft Health Bot](https://www.microsoft.com/en-us/research/project/health-bot/) for a private preview and details.

A simple web page to hand off users to the Microsoft Health bot

1. Deploy the website:

[![Deploy to Azure](https://azuredeploy.net/deploybutton.png)](https://azuredeploy.net/)

2.Set the following environment variables:

`APP_SECRET`

`WEBCHAT_SECRET`

3.Set the Bot service direct line channel endpoint (optional)

In some cases it is required to set the endpoint URI so that it points to a specific geography. The geographies supported by the bot service each have a unique direct line endpoint URI:

- `directline.botframework.com` routes your client to the nearest datacenter. This is the best option if you do not know where your client is located.
- `asia.directline.botframework.com` routes only to Direct Line servers in Eastern Asia.
- `europe.directline.botframework.com` routes only to Direct Line servers in Europe.
- `northamerica.directline.botframework.com` routes only to Direct Line servers in North America.

Pass your preferred geographic endpoint URI by setting the environment variable: `DIRECTLINE_ENDPOINT_URI` in your deployment. If no variable is found it will default to `directline.botframework.com`

**Note:** If you are deploying the code sample using the "Deploy to Azure" option, you should add the above secrets to the application settings for your App Service. 

## Live agent handoff sample

The live agent handoff sample is wrapper around the standard webchat that is generally used by end users. This sample is intended for testing the handoff scenario that is built-in to your Health Bot instance.

To access the sample you should follow the deployment instructions and request the `/agent.html` path from your browser. This will load a dummy login page that illustrates the agent experience (you can provide any values to access the agent portal). Within the agent portal you can issue agent commands to interact with end users that are talking with your bot.

The wrapper adds to the server.js file an agent flagging function: `function isAgentAuthenticated(req)` which will serve the agent webchat if a `true` value is returned. You should implement custom logic in this function that returns a `true` value once your agent has been authenticated.

**IMPORTANT:**
The sample login page is for testing and demonstration purposes only. You MUST authenticate agent access in a production deployment of the agent webchat. The agent webchat provides access to sensitive end user information.

## Customizing the webchat

You can send programmed messages to the agent webchat by invoking the `function talk(message)`. In the sample we have added example buttons with issue some of the built-in agent commands.

[Learn more about agent webchat functionality](https://docs.microsoft.com/en-us/HealthBot/handoff)