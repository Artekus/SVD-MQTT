# SVD-MQTT
Stream Volume Detect to MQTT

This program utilizes FFMPEG, MQTT Node.js, fluent-ffmpeg and ffmpeg-installer to provide audio level detection via the native FFMPEG "volumedetect" command and transmittes it with MQTT. And is based on info gleaned from https://stevebarbera.medium.com/volume-detection-for-a-audio-stream-dbe727085783
It can run on Windows, Docker, Linux if the appropriate dependencies are met, Node.js, the app dependencies, and FFMPEG.

The config.json file works as follows:

Configure the MQTT Server settings by editing the config.json file accordingly. SSL and user/password has not been setup yet but maybe added at a future time.

Configure the Cameras or Streams the same way, provide a name, the stream address and the analysis interval in seconds. To add addiional camera, utilize the same json structure and add another set to the array.

Edit the "FFmpegPathManual": "Your path here" and set "UseFFmpegManPath": true if you want to manually point to FFMPEG othewise it will attempt to use the ffmpeg-installer to run it. "FFMPEGupdateTime": 4 is the universal time out time for FFMPEG which is 4 seconds by default.


MQTT Functionality:
When the program runs it runs FFMPEG audio only stream "volumedetect". When analysis is completed successfully it publishes a MQTT message (sample shown), {"volume":{"max":-43.6,"mean":-66.3,"ffmpeg_stat":"ffmpeg completed","cam_stat":"running","time":"2021-10-24T22:16:30.498Z"}} to clientid/topic/cameraname as configured in the config.json file.

Docker:
Hope this works for you as it was trial and error for me to get it to work. After the image is created use the docker-compose file with the image name that was created by the docker file. Network mode may have to manually be set to host.

