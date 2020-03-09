# Health Bot Container

**Note:** In order to use this Web Chat with the Health Bot service, you will need to obtain your Web Chat secret by going to ["Integration/Secrets"](./secrets.png) on the navigation panel.
Please refer to [Microsoft Health Bot](https://www.microsoft.com/en-us/research/project/health-bot/) for a private preview and details.

A simple web page to hand off users to the Microsoft Health bot

## A. Deploy the Web Chat Client Application on *Azure App. Service*

1. Deploy the website

   [![Deploy to Azure][Deploy Button]][Deploy Node/GetConversationMembers]

   [Deploy Button]: https://azuredeploy.net/deploybutton.png
   [Deploy Node/GetConversationMembers]: https://azuredeploy.net
 
2. Set the following environment variables:

   `APP_SECRET`
   `WEBCHAT_SECRET`

## B. Deploy the Web Chat Client Application on *Azure Kubernetes Service*

1. Provision an *Azure Kubernetes Service* (AKS) cluster

   Refer to the documentation [here](https://docs.microsoft.com/en-us/azure/aks/kubernetes-walkthrough-rm-template).

2. Create Web Chat application container image

   Clone this GitHub repo. to a local directory on your machine. This machine/vm should have the following CLI tools installed on it.

   - [Docker container engine](https://docs.docker.com/install/linux/docker-ce/ubuntu/)
   - [Git SCM](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)
   - [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli?view=azure-cli-latest)
   - [Kubernetes CLI](https://kubernetes.io/docs/tasks/tools/install-kubectl/)
   - [Helm CLI](https://helm.sh/docs/intro/install/) 

   Use the provided `dockerfile` to build the Web Chat client application container image.  See code snippet below.

   ```bash
   # Create the container image.
   # Important: There is a '.' at the end of the command!!!!
   #
   $ docker build -t health-bot-client .
   #
   ```

3. Provision an *Azure Container Registry* (ACR)

   Refer to the documentation [here](https://docs.microsoft.com/en-us/azure/container-registry/container-registry-get-started-portal).

4. Push the Web Chat application container image to the Container Registry

   Refer to the command snippet below to push the container image into the ACR.  Remember to substitute to correct value for the ACR instance (name) in all the commands.

   ```bash
   # Login to the ACR with your credentials
   $ az acr login --name <acr-name>
   #
   # Tag the client application container image
   $ docker tag health-bot-client:latest <acr-name>.azurecr.io/health-bot-client:latest
   #
   # Push the image to ACR
   $ docker push <acr-name>.azurecr.io/health-bot-client:latest
   #
   # List the images in the ACR repository
   $ az acr repository list --name <acr-name> -o table
   #
   ```

5. Update the *Helm* Chart values file

   Edit the *Helm* chart values file `./bot-client/values.yaml` with correct values. Refer to the table below.

   Parameter Name | Description
   -------------- | -----------
   replicaCount | No. of instances of the Web Chat Client Application needed.
   image.registry | FQDN of the ACR instance.  Eg., <acr-name>.azurecr.io
   image.repository | Web Chat application repository name. Eg., health-bot-client
   image.tag | Tag name for the application container image.  Eg., latest
   healthBot.webchatSecret | Healthcare Bot Web secret.  Eg., value of `webchat_secret` from the [Health Bot Service Portal](https://us.healthbot.microsoft.com)
   healthBot.appSecret | Healthcare Bot App secret.  Eg., value of `app_secret` from the [Health Bot Service Portal](https://us.healthbot.microsoft.com)
   instrumentationKey | Azure Application Insights instrumentation key
   directLineApiEndpointUri | Direct Line Channel URI for Bot Service.  Refer to the last section for details.  Can be left empty.

5. Deploy Web Chat Client Application

   Use *Helm* to deploy the application on AKS. Refer to the command snippet below.

   ```bash
   # If you are using helm v2, update the 'apiVersion' value in 'bot-client/Chart.yaml' to v1.
   #
   # First, switch to the GitHub repo. root directory 'HealthBotContainerSample'
   #
   # Deploy the Web Chat client application.
   $ helm install bot-client ./bot-client/ --namespace healthbot 
   #
   # Get the Azure Load Balancer public IP address for the Web Chat Client App
   # Note down the public IP address under 'EXTERNAL-IP' column.
   $ kubectl get svc -n healthbot
   #
   # Lastly, use a web browser to access the Web Chat Client Application
   #
   ```

## Set the Bot service direct line channel endpoint (optional)

In some cases it is required to set the endpoint URI so that it points to a specific geography. The geographies supported by the bot service each have a unique direct line endpoint URI:

- `directline.botframework.com` routes your client to the nearest datacenter. This is the best option if you do not know where your client is located.
- `asia.directline.botframework.com` routes only to Direct Line servers in Eastern Asia.
- `europe.directline.botframework.com` routes only to Direct Line servers in Europe.
- `northamerica.directline.botframework.com` routes only to Direct Line servers in North America.

Pass your preferred geographic endpoint URI by setting the environment variable: `DIRECTLINE_ENDPOINT_URI` in your deployment. If no variable is found it will default to `directline.botframework.com`

**Note:** If you are deploying the code sample using the "Deploy to Azure" option, you should add the above secrets to the application settings for your App Service. 

## Agent webchat
If the agent webchat sample is also required, [switch to the live agent handoff branch](https://github.com/Microsoft/HealthBotContainerSample/tree/live_agent_handoff)
