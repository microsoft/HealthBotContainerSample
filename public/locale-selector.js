document.addEventListener("DOMContentLoaded", function (event)
{
    // set selection based on URL param
    setSelectedLocale()

    // reload page if selection changes
    document.getElementById("locale").addEventListener("change", function ()
    {
        const params = BotChat.queryParams(location.search);
        var currlocale = params["locale"] || 'en-en';
        var localepicker = document.getElementById("locale");
        if (localepicker)
        {
            var choice = localepicker.options[localepicker.selectedIndex].value;
            if (choice !== currlocale)
            {
                params["locale"] = choice;
                location.href = "?" + objectToQueryString(params);
            }
        }
    });

    function setSelectedLocale()
    {
        const params = BotChat.queryParams(location.search);
        var l = params["locale"] || 'en-en';
        var opt = document.getElementById("locale").querySelector('option[value="' + l + '"]');
        if (opt)
        {
            opt.selected = true;
        }
    }

    function objectToQueryString(obj)
    {
        var str = [];
        for (var p in obj)
        {
            if (obj.hasOwnProperty(p))
            {
                str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
            }
        }
        return str.join("&");
      }
});