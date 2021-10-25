# SVD-MQTT
## Stream Volume Detect to MQTT

This program utilizes FFMPEG, MQTT Node.js, fluent-ffmpeg and ffmpeg-installer to provide audio level detection via the native FFMPEG "volumedetect" command and transmittes it with MQTT. And is based on info gleaned from https://stevebarbera.medium.com/volume-detection-for-a-audio-stream-dbe727085783
It can run on Windows, Docker, Linux if the appropriate dependencies are met, Node.js, the app dependencies, and FFMPEG.

## CONFIGURATION
The config.json file works as follows:

Configure the MQTT Server settings by editing the config.json file accordingly. SSL and user/password has not been setup yet but maybe added at a future time.

Configure the Cameras or Streams the same way, provide a name, the stream address and the analysis interval in seconds. To add an additional camera, utilize the same json structure and add another set to the array.

Edit the "FFmpegPathManual": "Your path here" and set "UseFFmpegManPath": true if you want to manually point to FFMPEG othewise it will attempt to use the ffmpeg-installer to run it. "FFMPEGupdateTime": 4 is the universal time out time for FFMPEG which is 4 seconds by default.

## Docker:
Hope this works for you as it was trial and error for me to get it to work. After the image is created use the docker-compose file with the image name that was created by the docker file. Network mode may have to manually be set to host.

## MQTT Functionality:
When the program runs it runs FFMPEG audio only stream with "volumedetect" option. When analysis is completed successfully it publishes a MQTT message (sample shown):
```JSON
{"volume":{"max":-43.6,"mean":-66.3,"ffmpeg_stat":"ffmpeg completed","cam_stat":"running","time":"2021-10-24T22:16:30.498Z"}} 
```
to clientid/topic/cameraname as configured in the config.json file.

## COMMANDS
Commands via MQTT are recieved on the following topics:
clientid/addCamStream, clientid/startCamStream, clientid/stopCamStream, clientid/restartCamStream, clientid/requestCamStreamData

The json format for the message is as follows:
```JSON
{ 'name': '', 'activate': false, 'data': '', 'response':'' }
```

To send the command publish to the respective topic, set the stream/camera name, 'name': 'example' and set 'activate': true
Depending on the command the data key may or may not be used. The response will be sent to the same topic from the app clearing the name, setting the activate to false, setting the response to the response message and data if applicable.

## Examples:
Add a camera stream named 'camera1' in config.json
Publish to clientid/addCamStream
```JSON
{ 'name': 'camera1', 'activate': true, 'data': 'rtsp://username:password@ipaddress', 'response':'' }
```

Start a camera stream named 'camera1' in config.json
Publish to clientid/startCamStream
```JSON
{ 'name': 'camera1', 'activate': true, 'data': '', 'response':'' }
```
Stop a camera stream named 'camera1' in config.json
Publish to clientid/stopCamStream
```JSON
{ 'name': 'camera1', 'activate': true, 'data': '', 'response':'' }
```

Restart a camera stream named 'camera1' in config.json
Publish to clientid/restartCamStream
```JSON
{ 'name': 'camera1', 'activate': true, 'data': '', 'response':'' }
```

Request latest data from a camera stream named 'camera1' in config.json and will be posted to the same topic under the data key.
Publish to clientid/requestCamStreamData
```JSON
{ 'name': 'camera1', 'activate': true, 'data': '', 'response':'' }
```

