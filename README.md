TODO:
1. Anounce to reolink devices. Hook this up with sirens
2. How to add more people to the alert email list?
3. Health Heartbeat. Warning if it doesn't work

>  ### 1. The "Heartbeat" Ping

  Right now, we are relying on the Frigate integration to tell us if it is offline (which it failed to do).
  Instead, I can write a custom REST Sensor that acts as a heartbeat. Every 15 seconds, Home Assistant will physically ping Frigate's backend API ( http://192.168.1.251:8971/api/stats ).
  If Frigate doesn't respond to the ping, we force all 5 cameras to instantly fall back to Reolink, completely bypassing the frozen integration.

  ### 2. The System Health Alert

  I can build a dedicated automation called  "Security - System Health Monitor" .
  If the heartbeat ping fails, or if Alarmo crashes, or if your Master Siren toggle becomes  unavailable , it will instantly send a Critical Push Notification to your phone: "WARNING:
  The Frigate camera system has gone offline. The alarm system has fallen back to Reolink sensors."

  This guarantees that you are never flying blind. If a config breaks, you will know immediately, and the system will automatically fall back to the backup sensors while you fix it.

3. Have cameras work together. We shouldn't get 3 lingering if they are visible by 3 cameras

4. 
