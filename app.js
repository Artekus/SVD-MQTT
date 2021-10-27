'use strict';
const config = require('./config/config.json'); //initial configuration load
const fs = require('fs'); //file stream read write -FUTURE-
const mqttServer = config.mqttServer; //mqtt server IP address
const clientid = config.clientid; //clientid, also used for topic
const mqttmsgoptions = config.mqttOptions;
const FFMPEGupdateTime = config.FFMPEGupdateTime; //universal update FFMPEG time
const ffmpegPath = (config.UseFFmpegManPath) ? config.FFmpegPathManual : require('@ffmpeg-installer/ffmpeg').path; //"C:\\FFMPEG\\bin\\ffmpeg.exe";
const ffmpeg = require('fluent-ffmpeg');
const topic = config.clientid + '/' + config.topic; //publish topic prefix
const defaultMessage = config.defaultMessage; //default message for erros
const mqtt = require('mqtt');

var CAMERA_FFMPEG_PROCESS = [];
var CAMERA_DATA = config.cameras; //camera objects with settings
var mqttSTopics = [clientid + '/restartCamStream', clientid + '/addCamStream',
    clientid + '/updateCamStreamSettings', clientid + '/stopCamStream',clientid + '/startCamStream', clientid + '/requestCamStreamData' ,
    clientid + '/updateConfig' ];
var mqttSTopicsValues = [];
var mqttCamStatusValues = [];
var mqttsQos = 1;
var mqttSubInterval;
var mqttSubPInterval=[];
ffmpeg.setFfmpegPath(ffmpegPath);

console.log((new Date().toISOString()) + ": ffmpegPath     := " + ffmpegPath);
console.log((new Date().toISOString()) + ": camera count   := " + config.cameras.length);

//Connect to MQTT Server
var client = mqtt.connect(mqttServer, { clientId: clientid });

//Loop to creat array of cameras for time intervals for FFMPEG Stream Volume Detect
var i;
var j;
var arrayCamTimeIntervals = [];
var arrayFFMPEGCount = [];
var arrayFFMPEGComplete = [];
console.log((new Date().toISOString()) + ": Cam Length Func : " + config.cameras.length);

onStart(j);

function onStart(j) {
    loadConfigSettings(i);

    //Set Subscribe MQTT Up for Use
    var defaultsMQTTST = { 'name': '', 'activate': false, 'data': '', 'response':'' };
    client.on("connect", function () {
        console.log((new Date().toISOString()) + ": MQTT Status  : " + client.connected);
        //clear the subscribe topics to defaults
        for (j = 0; j < mqttSTopics.length; j++) { 
            mqttpublish(mqttSTopics[j], JSON.stringify(defaultsMQTTST), mqttmsgoptions, j, function (response) {
                console.log((new Date().toISOString()) + ": MQTT Sub Pub   : " + mqttSTopics[j] + " is " + response);
                (response) ? clearInterval(mqttSubPInterval[j]) : console.log("Waiting");
            });
        }
        //subscribe to all topics in array
        mqttsubscribe(mqttSTopics, mqttsQos, function (response) {
            console.log((new Date().toISOString()) + ": MQTT Subsribe  : " + response);
            (response) ? clearInterval(mqttSubInterval) : console.log("Waiting");
        });
    });
}

function loadConfigSettings(i) {
    for (i = 0; i < (config.cameras.length); i++) {
        console.log((new Date().toISOString()) + ": Loading Camera :" + CAMERA_DATA[i].name + " Stream:= " + CAMERA_DATA[i].streamURL);
        startAnalysis(i, CAMERA_DATA);
    }
}
//setInterval(function () { console.log("Array: " + JSON.stringify(arrayCamTimeIntervals)); }, 6000);


//Starts the Volume Detect with setInterval for repective cameras
function startAnalysis(i, CAMERA_DATA) {

    arrayFFMPEGCount[CAMERA_DATA[i].name] = 0; //sets the FFMPEG Command count for respective camera
    arrayFFMPEGComplete[CAMERA_DATA[i].name] = true; //sets the first run FFMPEG for the respective camera
    mqttCamStatusValues[CAMERA_DATA[i].name] = {
        'camera': CAMERA_DATA[i].name, 'msgid':0, "volume": { 'max': '', 'mean': '','ffmpeg_stat':"", 'cam_stat': "created", "time": new Date().toISOString() }
    };
    //creates array of IDS for setInterval for each camera in config.json
    arrayCamTimeIntervals[CAMERA_DATA[i].name] =
        setInterval(function () {

            //Runs check if first run through or if last FFMPEG analysis completed for respective camera
            if (arrayFFMPEGComplete[CAMERA_DATA[i].name]) {
                arrayFFMPEGCount[CAMERA_DATA[i].name] = 1 + arrayFFMPEGCount[CAMERA_DATA[i].name];
                arrayFFMPEGComplete[CAMERA_DATA[i].name] = false;

                //Calls the FFMPEG analysis function
                getVolumeAnalysis(CAMERA_DATA[i], arrayFFMPEGCount[CAMERA_DATA[i].name], function (statVolume) {
                    //sets mqtt message for respective camera to returned results
                    let messageReturn = JSON.stringify({ "volume": { 'max': statVolume.max, 'mean': statVolume.mean, 'ffmpeg_stat': statVolume.status, 'cam_stat': 'running' , "time": statVolume.timestamp } });
                    //Sets mqtt message to error message if nothing returned
                    if (!statVolume) { 
                        mqttCamStatusValues[CAMERA_DATA[i].name].volume.ffmpeg_stat = "Unknown Process Error";
                        messageReturn = JSON.stringify({ "volume": { 'max': mqttCamStatusValues[CAMERA_DATA[i].name].volume.max, 'mean': mqttCamStatusValues[CAMERA_DATA[i].name].volume.mean, 'ffmpeg_stat': mqttCamStatusValues[CAMERA_DATA[i].name].ffmpeg_stat, 'cam_stat': 'running', "time": new Date().toISOString() } });
                        mqttpublish(topic + "/" + CAMERA_DATA[i].name, messageReturn, mqttmsgoptions, mqttCamStatusValues[CAMERA_DATA[i].name].msgid, function (posted) {
                        });
                    }
                    // Outputs log if an error is reported by FFMPEG
                    if (statVolume.error) {
                        console.log((new Date().toISOString()) + ": FFmpeg End Err : " + arrayFFMPEGCount[CAMERA_DATA[i].name] + " : " + CAMERA_DATA[i].name + " Cleared: " + statVolume.errmsg);
                        mqttCamStatusValues[CAMERA_DATA[i].name].volume.ffmpeg_stat = "Process Error";
                        mqttCamStatusValues[CAMERA_DATA[i].name].msgid = statVolume.id;
                        messageReturn = JSON.stringify({ "volume": { 'max': mqttCamStatusValues[CAMERA_DATA[i].name].volume.max, 'mean': mqttCamStatusValues[CAMERA_DATA[i].name].volume.mean, 'ffmpeg_stat': "Process Error", 'cam_stat': 'running', "time": new Date().toISOString() } });
                        mqttpublish(topic + "/" + CAMERA_DATA[i].name, messageReturn, mqttmsgoptions, statVolume.id, function (posted) {
                        });
                        //clearInterval(arrayCamTimeIntervals[CAMERA_DATA[i].name]);
                    }
                    // publishes the MQTT message if there is no error and mqtt is connected
                    if (client.connected && !statVolume.error) {
                        console.log((new Date().toISOString()) + ": MQTT Processing : " + statVolume.id + ": " + CAMERA_DATA[i].name);
                        mqttCamStatusValues[CAMERA_DATA[i].name] = {
                            'camera': CAMERA_DATA[i].name, 'msgid': statVolume.id, "volume": { 'max': statVolume.max, 'mean': statVolume.mean, 'ffmpeg_stat': statVolume.status, 'cam_stat': 'running', "time": statVolume.timestamp }
                        };
                        mqttpublish(topic + "/" + CAMERA_DATA[i].name, messageReturn, mqttmsgoptions, statVolume.id, function (posted) {
                        });
                    }

                    // don't do anything if MQTT is not connected
                    if (!client.connected) {
                        console.log((new Date().toISOString()) + ": MQTT NOT CONNECTED!");
                    }

                    //Mark FFMPEG analysis complete for respective camera
                    arrayFFMPEGComplete[CAMERA_DATA[i].name] = true;
                });
            }
            
        }, (CAMERA_DATA[i].UpdateTime * 1000 + 2000));
    console.log((new Date().toISOString()) + ": array index      : " + CAMERA_DATA[i].name);
}

/************** MQTT Handling Functions *************/


client.on("connect", function () {
    console.log((new Date().toISOString()) + ": MQTT Status    : " + client.connected);
});

client.on("error", function (error) {
    console.log((new Date().toISOString()) + ": MQTT Status    : " + error);
});


client.on('message', function (stopic, message, packet) {
    mqttSTopicsValues[stopic] = JSON.parse(message); //Parse the mqtt message
    console.log((new Date().toISOString()) + ": SubscribeTopic : " + stopic + " : Data set to: " + mqttSTopicsValues[stopic].data);

    var responseMQTTST = { 'name': '', 'activate': false, 'data': '', 'response': '' }; //blank response message that clears activate signal

    //Add a Camera Stream Analysis from MQTT message
    if (stopic == (clientid + "/addCamStream") && mqttSTopicsValues[stopic].data != "") {
        addCamStream(mqttSTopicsValues[stopic], function (response) {
            responseMQTTST.response = response;
            let messageReturn = JSON.stringify({
                "volume": {
                    'max': mqttCamStatusValues[mqttSTopicsValues[stopic].name].volume.max, 'mean': mqttCamStatusValues[mqttSTopicsValues[stopic].name].volume.mean,
                    'ffmpeg_stat': mqttCamStatusValues[mqttSTopicsValues[stopic].name].volume.ffmpeg_stat, 'cam_stat': responseMQTTST.response, "time": new Date().toISOString()
                }
            });
            //Wait for last FFMPEG Analysis to stop or complete then send the MQTT stopped response
            setTimeout(() => {
                console.log(mqttSTopicsValues[stopic].name);
                mqttpublish(topic + "/" + mqttSTopicsValues[stopic].name, messageReturn, mqttmsgoptions, responseMQTTST.response, function (posted) { });
            }, FFMPEGupdateTime * 1000 + 5000);
        });
        mqttpublish(stopic, JSON.stringify(responseMQTTST), mqttmsgoptions, stopic, function (response) {
            //console.log("MQTT subscribed publish: " + mqttSTopics[j] + " is " + response);
            //(response) ? clearInterval(mqttSubPInterval[j]) : console.log("Waiting");
        });
    }
    //Stop Camera Stream Analysis from MQTT message
    if (stopic == (clientid + "/stopCamStream") && mqttSTopicsValues[stopic].activate) {
        stopCamStream(mqttSTopicsValues[stopic], function (response) {
            responseMQTTST.response = response;
            var camname= mqttSTopicsValues[stopic].name;
            let messageReturn = JSON.stringify({
                "volume": {
                    'max': mqttCamStatusValues[mqttSTopicsValues[stopic].name].volume.max, 'mean': mqttCamStatusValues[mqttSTopicsValues[stopic].name].volume.mean,
                    'ffmpeg_stat': mqttCamStatusValues[mqttSTopicsValues[stopic].name].volume.ffmpeg_stat, 'cam_stat': responseMQTTST.response, "time": new Date().toISOString()
                }
            });
            //Wait for last FFMPEG Analysis to stop or complete then send the MQTT stopped response
            setTimeout(() => {
                //console.log("camname: " + camname);
                mqttpublish(topic + "/" + camname, messageReturn, mqttmsgoptions, responseMQTTST.response, function (posted) { });
            }, FFMPEGupdateTime * 1000 + 5000);
        });
        mqttpublish(stopic, JSON.stringify(responseMQTTST), mqttmsgoptions, stopic, function (response) {
        });
    }
    //Start Camera Stream Analysis from MQTT message
    if (stopic == (clientid + "/startCamStream") && mqttSTopicsValues[stopic].activate) {
        startCamStream(mqttSTopicsValues[stopic], function (response) {
            responseMQTTST.response = response;
            var camname = mqttSTopicsValues[stopic].name;
            let messageReturn = JSON.stringify({
                "volume": {
                    'max': mqttCamStatusValues[mqttSTopicsValues[stopic].name].volume.max, 'mean': mqttCamStatusValues[mqttSTopicsValues[stopic].name].volume.mean,
                    'ffmpeg_stat': mqttCamStatusValues[mqttSTopicsValues[stopic].name].volume.ffmpeg_stat, 'cam_stat': responseMQTTST.response, "time": new Date().toISOString()
                }
            });
            //Wait for last FFMPEG Analysis to stop or complete then send the MQTT stopped response
            setTimeout(() => {
                //console.log("camname: " + camname);
                mqttpublish(topic + "/" + camname, messageReturn, mqttmsgoptions, responseMQTTST.response, function (posted) { });
            }, FFMPEGupdateTime * 1000 + 5000);
        });
        mqttpublish(stopic, JSON.stringify(responseMQTTST), mqttmsgoptions, stopic, function (response) {
        });
    }
    //Restart Camera Stream Analysis from MQTT message
    if (stopic == (clientid + "/restartCamStream") && mqttSTopicsValues[stopic].activate) {
        restartCamStream(mqttSTopicsValues[stopic], function (response) {
            responseMQTTST.response = response;
            var camname = mqttSTopicsValues[stopic].name;
            let messageReturn = JSON.stringify({
                "volume": {
                    'max': mqttCamStatusValues[mqttSTopicsValues[stopic].name].volume.max, 'mean': mqttCamStatusValues[mqttSTopicsValues[stopic].name].volume.mean,
                    'ffmpeg_stat': mqttCamStatusValues[mqttSTopicsValues[stopic].name].volume.ffmpeg_stat, 'cam_stat': responseMQTTST.response, "time": new Date().toISOString()
                }
            });
            //Wait for last FFMPEG Analysis to stop or complete then send the MQTT stopped response
            setTimeout(() => {
                //console.log("camname: " + camname);
                mqttpublish(topic + "/" + camname, messageReturn, mqttmsgoptions, responseMQTTST.response, function (posted) { });
            }, FFMPEGupdateTime * 1000 + 5000);
        });
        mqttpublish(stopic, JSON.stringify(responseMQTTST), mqttmsgoptions, stopic, function (response) {
        });
    }
    //Return Latest Camera Stream Analysis from MQTT message
    if (stopic == (clientid +"/requestCamStreamData") && mqttSTopicsValues[stopic].activate) {
        requestCamStreamData(mqttSTopicsValues[stopic], function (response) {
            responseMQTTST.response = response;
            responseMQTTST.data = mqttCamStatusValues[mqttSTopicsValues[stopic].name];
            console.log("Response: " + responseMQTTST);
            console.log("MQTTStopic: " + mqttSTopics[stopic]);
        });
        mqttpublish(stopic, JSON.stringify(responseMQTTST), mqttmsgoptions, stopic, function (response) {
        });
    }
    //-FUTURE- Update Config File with current cameras from MQTT message
    if (stopic == (clientid + "/updateConfig") && mqttSTopicsValues[stopic].activate) {
        updateConfig(mqttSTopicsValues[stopic], function (response) {
            responseMQTTST.response = response;
        });
        mqttpublish(stopic, JSON.stringify(responseMQTTST), mqttmsgoptions, stopic, function (response) {
        });
    }
});

function mqttpublish(Ptopic,msg,options,id,callback) {
    //mqtt publish only if connectted
    let posted = true;
    if (client.connected == true) {
        client.publish(Ptopic, msg, options);
        console.log((new Date().toISOString()) + ": MSG Published   : " + id + ": " + Ptopic + " msg: " + msg + " at " + new Date().toISOString());
        return callback(posted);
    }
    posted = false;
    return callback(posted);
}


function mqttsubscribe(stopic, qos, callback) {
    //mqtt publish only if connectted
    let subscribeposted = true;

    if (client.connected == true) {
        client.subscribe(stopic, qos);
        console.log((new Date().toISOString()) + ": MQTT Subscribed: " + stopic + " at " + new Date().toISOString());
        return callback(subscribeposted);
    }
    subscribeposted = false;
    return callback(subscribeposted);
}


//Adds the stream from MQTT message
function addCamStream(decodeMessage, callback) {
    //var addCamStreamObj = { "name": decodeMessage.name, "streamURL": decodeMessage.data, "UpdateTime": 4 };
    //add the camera only if it doesn't exist
    var updateTimeValue = (Number.isInteger(decodeMessage.data) ? decodeMessage.data : 4);
    if (!arrayCamTimeIntervals[decodeMessage.name]) {
        i = i + 1;
        CAMERA_DATA[i] = { "name": decodeMessage.name, "streamURL": decodeMessage.data, "UpdateTime": updateTimeValue };
        console.log(CAMERA_DATA[i].name);
        startAnalysis(i, CAMERA_DATA);
        console.log((new Date().toISOString()) + ": Request Repy   : Stream Added");
        return callback('added');
    }
    //log failure
    console.log((new Date().toISOString()) + ": Request Repy   : Camera Exists stream failed to add");
    return callback('failed to add');
}

//Restart the stream function
function restartCamStream(decodeMessage, callback) {
    let funcCamStatus = "";
    if (arrayCamTimeIntervals[decodeMessage.name]) {
        stopCamStream(decodeMessage, function (response) {
            if (response != "stopped") {
                return callback(response);
            }
        });
        startCamStream(decodeMessage, function (response) {
            if (response != "started") {
                return callback(response);
            }
        });//responseMQTTST.response = response;
        return callback("restarted");
    }
    return callback("failed to restart");
}

//Stop the stream function
function stopCamStream(decodeMessage, callback) {
    if (arrayCamTimeIntervals[decodeMessage.name]) {
        CAMERA_FFMPEG_PROCESS[decodeMessage.name].kill();
        clearInterval(arrayCamTimeIntervals[decodeMessage.name]);
        console.log((new Date().toISOString()) + ": Request Repy   : Camera Analysis Stopped : " + decodeMessage.name);
        arrayFFMPEGComplete[decodeMessage.name] = false;
        return callback('stopped');
    }
    console.log("Camera: " + decodeMessage.name + " not found!");
    return callback('failed to stop');
}

//Request the camera stream data function. Checks if cam exist.
function requestCamStreamData(decodeMessage, callback) {
    if (arrayCamTimeIntervals[decodeMessage.name]) {
        return callback("cam found sending data");
    }
    return callback("data request failed");
}


//Start the camera stream function. Checks if cam exist and starts the stream analysis.
function startCamStream(decodeMessage, callback) {
    //var addCamStreamObj = { "name": decodeMessage.name, "streamURL": decodeMessage.data, "UpdateTime": 4 };

    //Start camera only if it exist
    if (arrayCamTimeIntervals[decodeMessage.name]) {
        //CAMERA_DATA[arrayCamTimeIntervals.indexOf(decodeMessage.name)] = { "name": decodeMessage.name, "streamURL": decodeMessage.data, "UpdateTime": 4 };
        console.log((new Date().toISOString()) + ": Request Repy   : " + Object.keys(arrayCamTimeIntervals).indexOf(decodeMessage.name));
        console.log((new Date().toISOString()) + ": Request Repy   : " + CAMERA_DATA[Object.keys(arrayCamTimeIntervals).indexOf(decodeMessage.name)].name);
        startAnalysis(Object.keys(arrayCamTimeIntervals).indexOf(decodeMessage.name), CAMERA_DATA);
        console.log((new Date().toISOString()) + ": Request Repy   : Camera : " + Object.keys(arrayCamTimeIntervals).indexOf(decodeMessage.name) + " Stream Analysis Started.");
        return callback('started');    }

    //log failure
    console.log((new Date().toISOString()) + ": Request Repy   : Camera " + Object.keys(arrayCamTimeIntervals).indexOf(decodeMessage.name) + " Steam Analysis Failed to Start");
    return callback('failed to start');
}

//-Future- will update the config.json file with current cameras
function updateCamStreamSettings(decodeMessage) {
}
console.log("Listening for Events");

//Audio Volume Detection Function
function getVolumeAnalysis(SINGLECAMERA_DATA, id, callback) {
    CAMERA_FFMPEG_PROCESS[SINGLECAMERA_DATA.name] = new ffmpeg({ source: SINGLECAMERA_DATA.streamURL })
        .withAudioFilter('volumedetect')
        .addOption('-f', 'null')
        //.addOption('-hwaccel', 'vaapi')  //this is my attempt at hardware acceleration -FUTURE-
        //.addOption('- hwaccel_device', '/dev/dri/renderD128') //this is my attempt at hardware acceleration -FUTURE-
        .addOption('-t', SINGLECAMERA_DATA.UpdateTime) // duration of analysis
        .noVideo()

        .on('start', function (ffmpegCommand) {
            console.log((new Date().toISOString()) + ': ffmpeg command : ' + id + ': ' + SINGLECAMERA_DATA.name);// + ' cmd: ' + ffmpegCommand);
        })

        .on('end', function (stdout, stderr) {
            // console.log('ffmpeg ended');
            // find the mean_volume in the output
            clearTimeout(killprocess);
            let maxVolumeRegex = stderr.match(/max_volume:\s(-\d*(\.\d+)?)/);
            let meanVolumeRegex = stderr.match(/mean_volume:\s(-\d*(\.\d+)?)/);
            // return the max and mean volume and timestamp
            let statVolume = {};
            statVolume.id = id;

            //Set the callback values if max volume found
            if (maxVolumeRegex) {
                statVolume.max = parseFloat(maxVolumeRegex[1]);
                statVolume.mean = parseFloat(meanVolumeRegex[1]);
                statVolume.timestamp = new Date().toISOString();
                statVolume.error = false;
                statVolume.complete = true;
                statVolume.status = "ffmpeg completed";
                return callback(statVolume);
            }
            // if the stream is not available do this
            if (stderr.match(/Server returned 404 Not Found/)) {
                console.log((new Date().toISOString()) + ': ffmpeg reply   : ffmpeg 404 error: ' + SINGLECAMERA_DATA.name);
                CAMERA_FFMPEG_PROCESS[SINGLECAMERA_DATA.name].kill('SIGSTOP');
                statVolume.complete = false;
                statVolume.error = false;
                statVolume.errmsg = 'ffmpeg 404 error: ' + SINGLECAMERA_DATA.name;
                statVolume.status = "ffmpeg 404 error";
                return callback(statVolume);
            }
            // if the stream returns a bad request do this
            if (stderr.match(/Server returned 400 Bad Request/)) {
                console.log((new Date().toISOString()) + ': ffmpeg reply   : ffmpeg 400 error: ' + SINGLECAMERA_DATA.name);
                CAMERA_FFMPEG_PROCESS[SINGLECAMERA_DATA.name].kill('SIGSTOP');
                statVolume.complete = false;
                statVolume.error = true;
                statVolume.errmsg = 'ffmpeg 400 error: ' + SINGLECAMERA_DATA.name;
                statVolume.status = "ffmpeg 400 error";
                return callback(statVolume);
            }
            //It went to crap, catch all log message
            console.log((new Date().toISOString()) + ': ffmpeg reply  : Analysis Failure' + stderr);
            statVolume.complete = false;
            statVolume.error = true;
            statVolume.errmsg = 'Unknown error: ' + SINGLECAMERA_DATA.name;
            statVolume.status = "Something went really wrong";
            return callback(statVolume);
        })

        //progress updates maybe use in the future
        //.on('progress', function (progress) {
        //    console.log('Processing: ' + SINGLECAMERA_DATA.name + " at " + progress.percent + '% done');
        //})


        // Deal with Errors when running FFMPEG command or when FFMPEG stopped
        .on('error', function (err, stdout, stderr) {
            let statVolume = {};
            statVolume.id = id;
            console.log((new Date().toISOString()) + ': ffmpeg reply   : ffmpeg error: ' + SINGLECAMERA_DATA.name);
            //console.log('Cannot process video, kill process: ' + SINGLECAMERA_DATA.name +' error: ' + err.message);
            statVolume.error = true;
            statVolume.errmsg = 'ffmpeg major error: Cannot process audio for ' + SINGLECAMERA_DATA.name;
            statVolume.stat = "ffmpeg major error";
            CAMERA_FFMPEG_PROCESS[SINGLECAMERA_DATA.name].kill();
            return callback(statVolume);
        })
        .saveToFile('/dev/null');

    // Aways kill ffmpeg after ffmpegupdatetime + 5 seconds

    var killprocess = setTimeout(function () {
        let statVolume = {};

        /*ffmpegAnalysis.on('error', function () {
            console.log('Ffmpeg has been killed! kill process: ' + SINGLECAMERA_DATA.name + ' error: ');
            statVolume.error = true;
            statVolume.errmsg = 'ffmpeg process timeout ' + SINGLECAMERA_DATA.name;
            statVolume.stat = "ffmpeg process timeout ";
        });*/

        console.log((new Date().toISOString()) + ': ffmpeg reply   : Ffmpeg timeout killed: ' + SINGLECAMERA_DATA.name);
        statVolume.error = true;
        statVolume.errmsg = 'ffmpeg process timeout ' + SINGLECAMERA_DATA.name;
        statVolume.stat = "ffmpeg process timeout ";
        CAMERA_FFMPEG_PROCESS[SINGLECAMERA_DATA.name].kill();
        return callback(statVolume);
    }, (FFMPEGupdateTime*1000 + 5000));
}
