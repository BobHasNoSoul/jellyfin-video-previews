# jellyfin-video-previews

https://github.com/user-attachments/assets/7dc72eb2-64c6-4c22-93ed-1e7ce0000c98

this is an injection mod for jellyfin that adds a live video previews when mouse over is done

to install it put `vidprev.js` into your webroot for linux is it usually /usr/share/jellyfin/web however you can always check your logs and look for webdir or webroot listing.

if you have already got a jellyfin-credentials hook you can ignore the next code (this is common from many of my mods and is included in a few others like the plugin variant of the media bar) 

jellyfin-credentials hook (add the following code to index.html if you do not already have a hook from anywhere else)

```
const saveJellyfinCredentials = (serverId, accessToken) => {
    const credentials = {
        Servers: [{ Id: serverId, AccessToken: accessToken }],
    };

    try {
        localStorage.setItem("jellyfin_credentials", JSON.stringify(credentials));
        console.log("Jellyfin credentials saved successfully.");
    } catch (e) {
        console.error("Error saving Jellyfin credentials", e);
    }
};
```

insert the following into your index.html 
`<script defer src="vidprev.js"></script>`


now clear cache and reload the page 


Thanks to the testers:



### TO DO 
add the vidprev.js once the testers have tested this 
add the names of testers to the tester thanks
maybe elaborate on the instructions if they cannot be followed easily



if you want you can donate to me at https://ko-fi.com/bobhasnosoul
