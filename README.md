# Health Bot Container

**Note:** In order to use this Web Chat with the Health Bot service, you will need to obtain your Web Chat secret by going to ["Integration/Secrets"](./secrets.png) on the navigation panel.
Please refer to [Microsoft Health Bot](https://www.microsoft.com/en-us/research/project/health-bot/) for a private preview and details.

A simple web page to hand off users to the Microsoft Health bot

1.Deploy the website:

[![Deploy to Azure](https://azuredeploy.net/deploybutton.png)](https://azuredeploy.net/)

Note: It is recommended you use the default Linux host type when deploying the container.
However, if you wish to enable online file editing using the App Service Editor, select 'Windows'.

2.Set the following environment variables:

`APP_SECRET`

`WEBCHAT_SECRET`

3.Configure scenario invocation (optional):

The Healthcare Bot service uses [language models](https://docs.microsoft.com/HealthBot/language_model_howto) to interpret end user utterances and trigger the relevant scenario logic in response.

Alternatively, you can programmaticaly invoke a scenario before the end user provides any input.

To implement this behavior, uncomment the following code from the `function initBotConversation()` in the `/public/index.js` file:
```javascript
triggeredScenario: {
    trigger: "{scenario_id}",
    args: {
        myVar1: "{custom_arg_1}",
        myVar2: "{custom_arg_2}"
    }
}
```
Replace {scenario_id} with the scenario ID of the scenario you would like to invoke.
You can also pass different values through the "args" object. 

You can read more about programmatic client side scenario invocation [here](https://docs.microsoft.com/HealthBot/integrations/programmatic_invocation)


4.Set the Bot service direct line channel endpoint (optional)

In some cases it is required to set the endpoint URI so that it points to a specific geography. The geographies supported by the bot service each have a unique direct line endpoint URI:

- `directline.botframework.com` routes your client to the nearest datacenter. This is the best option if you do not know where your client is located.
- `asia.directline.botframework.com` routes only to Direct Line servers in Eastern Asia.
- `europe.directline.botframework.com` routes only to Direct Line servers in Europe.
- `northamerica.directline.botframework.com` routes only to Direct Line servers in North America.

Pass your preferred geographic endpoint URI by setting the environment variable: `DIRECTLINE_ENDPOINT_URI` in your deployment. If no variable is found it will default to `directline.botframework.com`

**Note:** If you are deploying the code sample using the "Deploy to Azure" option, you should add the above secrets to the application settings for your App Service.

## Agent webchat
If the agent webchat sample is also required, [switch to the live agent handoff branch](https://github.com/Microsoft/HealthBotContainerSample/tree/live_agent_handoff)
