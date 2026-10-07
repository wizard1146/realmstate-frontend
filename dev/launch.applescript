-- Realmstate Lab: double-click to play. Starts the lab's dev server (which starts the local game if it isn't
-- running), then opens the lab in the browser. Running it again just opens the page.
-- Build the app from this file: osacompile -o ../"Realmstate Lab.app" dev/launch.applescript
set lab to "/Users/yu/Projects/dev/realmstate-lab"
set labUrl to "http://localhost:3400/"
set answer to (do shell script "curl -s -o /dev/null -w '%{http_code}' " & labUrl & " || true")
if answer is not "200" then
	do shell script "/bin/bash -c " & quoted form of ("cd " & quoted form of lab & " && PATH=/usr/local/bin:/opt/homebrew/bin:$PATH exec node dev/serve.mjs >/tmp/realmstate-lab.log 2>&1 </dev/null") & " >/dev/null 2>&1 </dev/null &"
	repeat 40 times
		delay 0.5
		if (do shell script "curl -s -o /dev/null -w '%{http_code}' " & labUrl & " || true") is "200" then exit repeat
	end repeat
end if
do shell script "open " & quoted form of labUrl
