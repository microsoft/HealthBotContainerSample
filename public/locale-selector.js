document.addEventListener("DOMContentLoaded", function (event) {
    // set selection based on URL param
    setSelectedLocale()

    // reload page if selection changes
    document.getElementById("locale").addEventListener("change", function (e) {
        const params = BotChat.queryParams(location.search);
        var curr = params["locale"] || 'en-en';
        var el = document.getElementById("locale");
        if (el) {
            var choice = el.options[el.selectedIndex].value;
            if (choice !== curr) {
                params["locale"] = choice;
                location.href = "?" + objectToQueryString(params);
            }
        }
    });

    function setSelectedLocale() {
        const params = BotChat.queryParams(location.search);
        var l = params["locale"] || 'en-en';
        var opt = document.getElementById("locale").querySelector('option[value="' + l + '"]');
        if (opt) {
            opt.selected = true;
        }
    }

    function objectToQueryString(obj) {
        var str = [];
        for (var p in obj) {
            if ( obj.hasOwnProperty(p)) {
                str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
            }
        }
        return str.join("&");
      }
});