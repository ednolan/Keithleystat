//expressserver.js: main ardustat control code

//********************
//Initialization/Setup
//********************

var http = require("http"); //HTTP Server
var url = require("url"); // URL Handling
var fs = require('fs'); // Filesystem Access (writing files)
var os = require("os"); //OS lib, used here for detecting which operating system we're using
var util = require("util");

var exec = require("child_process").exec;
function log_stdout(error, stdout, stderr) { console.log(stdout) } //For executing command line arguments

var express = require('express'), //App Framework (similar to web.py abstraction)
    app = express.createServer();
	app.use(express.bodyParser());
	app.use(app.router);
io = require('socket.io').listen(app); //Socket Creations
io.set('log level', 1)

outputoff = true;

if (process.argv.length == 2) {
	//no serial port in command line
	console.log("Please enter the serial port via the command line")
	process.exit(0)
}
else {
	serialPort = connectToSerial();
}

if (process.argv.length <= 3) tcpport = 8888
else tcpport = process.argv[3] //port of the HTTP server
if (process.argv.length <= 4) s000_sample_rate = 170 //delay in milliseconds between requests to the arduino for data
else s000_sample_rate = process.argv[4]
if (process.argv.length <= 5) queue_write_rate = 30 //delay in milliseconds between command writes to the arduino
else queue_write_rate = process.argv[5]

resistance=587.6
coefficient=475
error=0
current_threshold = 0.007 //threshold in Amps to switch from low-current to high-current mode
high_current = false

//MongoDB stuff
db_connected = false
try
{
	//var Mongolian = require("mongolian")
	//var server = new Mongolian
	var mongo = require('mongoskin');
	var db = mongo.db("localhost:27017/ardustat")
	db_connected = true
	central_info = "central_info"
	
}
catch (err)
{
	console.log("MongoDB Error:",err)
}

//Express Redirects
//Static Redirects
app.use("/flot", express.static(__dirname + '/flot'));
app.use("/socket.io", express.static(__dirname + '/node_modules/socket.io/lib'));

//*******************
//User interface code
//*******************

//On Home Page
app.get('/', function(req, res){
	indexer = fs.readFileSync('index.html').toString()
    res.send(indexer);
});

//Define Debug Page 
//Use for debugging ardustat features
app.get('/debug', function(req, res){
	indexer = fs.readFileSync('debug.html').toString()
    res.send(indexer);
});

//Cycler Page
app.get('/cycler', function(req, res){
	indexer = fs.readFileSync('cycler.html').toString()
    res.send(indexer);
});

//CV Page
app.get('/cv', function(req, res){
	indexer = fs.readFileSync('cv.html').toString()
    res.send(indexer);
});

app.get('/getlogs', function(req, res) {
	indexer = fs.readFileSync('getlogs.html').toString()
	res.send(indexer);
});

app.get('/plotter/*', function(req, res) {
	indexer = fs.readFileSync('plotter.html').toString()
	res.send(indexer);
});

app.get('/cv_viewer/*', function(req, res){
	indexer = fs.readFileSync('cv_viewer.html').toString()
    res.send(indexer);
});

//Accept data (all pages, throws to setStuff()
app.post('/senddata', setStuff,function(req, res,next){
	//console.log(req.body)
	res.send(req.body)	
});

//Presocket Connect, may reuse when flat files/mongodb is implemented
app.post('/getdata',function(req, res){
	res.send(req.app.settings)
});

app.post('/getdata_viewer', getStuff_viewer, function(req, res) {
	res.send(req.app.settings)
});

//Start web server
try {
	app.listen(tcpport);
	console.log('Express server started on port ' + app.address().port.toString() + 
				'\nGo to http://localhost:'+app.address().port.toString() + '/ with your web browser.');
}
catch(err) {
	console.log("Could not start express server!")
	console.log("This is probably due to an existing node.js process that hasn't exited.")
	console.log("Try running 'killall node'.")
	process.exit()
}

//*****************
//Program Functions
//*****************

//setStuff: handles POST requests from web interface
function setStuff(req,res)
{
	//loops to false
	//If directcmd (e.g. direct signal to ardustat)
	if (req.body.directcmd != undefined) serialPort.write(req.body.directcmd)
	
	if (req.body.logger != undefined)
	{
		logger = req.body.logger
		everyxlog = parseInt(req.body.everyxlog)
		//console.log(logger)
		if (logger == "started")
		{
			console.log("Starting log")
			profix = req.body.datafilename + "_" + new Date().getTime().toString()
			datafile = profix
			if (db_connected) 
			{
				collection = db.collection(profix)	
			}
		}
		else if (logger = "stopped")
		{
			console.log("Stopping log")
		}
	}
	if (req.body.exportcsv != undefined)
	{	
		collectiontoexport = req.body.exportcsv
		console.log("Exporting database", collectiontoexport, "to CSV")
		mongoexportcmd = "mongoexport -csv -o ../CSVfiles/" + collectiontoexport + ".csv -d ardustat -c " + collectiontoexport + " -f time,VOLT,CURR"
		exec(mongoexportcmd, log_stdout)
	}
	var holdup = false
	//If abstracted command (potentiostat,cv, etc)
	if (req.body.command != undefined)
	{
		cv = false
		arb_cycling = false
		
		command = req.body.command;
		value = req.body.value;
		if (command == "ocv")
		{
			console.log("Setting OCV");
			ocv()
		}
		if (command == "potentiostat")
		{
			console.log("Setting potentiostat");
			potentiostat(value)
		}
		if (command == "galvanostat")
		{
			console.log("Setting galvanostat");
			galvanostat(value)
		}
		if (command == "cv")
		{
			console.log("Setting cv");
			cv_start_go(value)
		}
		if (command == "cycling")
		{
			console.log("Setting cycler");
			cycling_start_go(value)
		}
		if (command == "startsavedcycling")
		{
			console.log("Setting cycler to saved settings:", value)
			startsavedcycling(value)
		}
		if (command == "idset") {
			console.log("Setting ID");
			set_id(value);
		}
	}
	
	if (req.body.programs != undefined)
	{
		if (req.body.programs == "cyclingsave")
		{
			value = req.body.value;
			holdup = true
			console.log("Saving cycler");
			holdup = true;
			cyclingsave(value,res)	
		}
		if (req.body.programs == "cyclingpresetsget")
		{
			holdup = true
			console.log("Getting cycler");
			holdup = true;
			db.collection("cycling_presets").find().toArray(function(err,data)
			{
				console.log(data)
				res.send(data)	
			})		
		}
	}
	if (!holdup) res.send(req.body)
	
}

//cycling save

function cyclingsave(value,res)
{
	console.log(value)
	value['time'] = new Date().getTime()
	db.collection("cycling_presets").update({name:value.name},value,{upsert:true})
	db.collection("cycling_presets").find().toArray(function(err,data)
	{
		console.log(data)
		res.send(data)	
	})
}

function startsavedcycling(value)
{
	db.collection("cycling_presets").find().toArray(function(err, data)
	{
		for(var k=0;k<data.length;k++) {
			if(data[k]["name"] == value) {
				cycling_start_go(data[k]["program"])
			}
		}
	})
}

//Global Variables for CV
cv = false
cycling = false
cv_set = 0
cv_dir = 1
cv_rate = 1000
cv_max = 1
cv_min = -1
cv_cycle = 1
cv_cycle_limit = 1
cv_step = 0
cv_time  = new Date().getTime()	
cv_arr = []
last_comm = ""
cv_comm = ""
cv_settings = {}
//Global Variables for Logging
logger = "stopped"
datafile = ""
everyxlog = 1

//Global Variables for Arb Cycling
arb_cycling = false
arb_cycling_settings = []
arb_cycling_step = 0
arb_cycling_step_start_time = 0
last_current = 0
last_potential = 0




function cycling_start_go(value)
{
	arb_cycling_settings = []
	arb_cycling_step = 0
	arb_cycling = false
	arb_cycling_step_start_time = new Date().getTime()
	console.log("Received cycling string(s):\n", value)
	for (var i = 0; i < value.length; i++)
	{
		cleaned_up = JSON.parse(value[i])
		arb_cycling_settings.push(cleaned_up)
	}

	console.log("Setting cycling settings:\n",arb_cycling_settings)
	arb_cycling = true
	cycling_mode()
}

function cycling_stepper()
{
	
	time = new Date().getTime()	
	this_set = arb_cycling_settings[arb_cycling_step]
	next_time = this_set['cutoff_time']
	direction = this_set['direction']
	cutoff_potential = this_set['cutoff_potential']
	
	way = 1
	if (direction == "discharge") way = -1
	
	this_time = time-arb_cycling_step_start_time
	//console.log(next_time - this_time)
	if (next_time != 0 & next_time < this_time) 
	{
	 	next_step()
	}
	else if (cutoff_potential != "") {
		if (this_set["mode"] == "galvanostat" & direction == "charge" & last_potential > cutoff_potential)
		{
			next_step()
		}
		else if (this_set["mode"] == "galvanostat" & direction == "discharge" & last_potential < cutoff_potential)
		{
			next_step()
		}
	}
}

function next_step()
{
	arb_cycling_step++
	if (arb_cycling_step >= arb_cycling_settings.length) arb_cycling_step = 0
	console.log("Switching to cycling step",arb_cycling_step);
	cycling_mode()
}

function cycling_mode()
{
	arb_cycling_step_start_time = new Date().getTime()
	this_set = arb_cycling_settings[arb_cycling_step]
	console.log("Current cycling settings are:",this_set)
	if (this_set['mode']=='potentiostat')
	{
		potentiostat(this_set['value'])
	}
	if (this_set['mode']=='galvanostat')
	{
		if (this_set['value'] == 0) ocv()
		else galvanostat(this_set['value'])
	}
	
}

//Abstracted Electrochemical Functions

//Initiate CV
function cv_start_go(value)
{
		cv_arr = []
		moveground(2.5)
		//convert mV/s to a wait time
		cv_dir = 1
		cv_rate =  (1/parseFloat(value['rate']))*1000*5
		cv_max = parseFloat(value['v_max'])
		cv_min = parseFloat(value['v_min'])
		cv_start = parseFloat(value['v_start'])
		cv_cycle_limit = parseFloat(value['cycles']*2)
		cv_cycle = 0
		cv = true
		cv_time  = new Date().getTime()	
		cv_step = cv_start
		potentiostat(cv_step)
		cv_settings = value
		cv_settings['cycle'] = cv_cycle
		
}

//Step through CV
function cv_stepper()
{
	time = new Date().getTime()	
	if (time - cv_time > cv_rate)
	{
		console.log("next step")
		cv_time = time 
		cv_step = cv_step + cv_dir*.005
		if (cv_step > cv_max & cv_dir == 1)
		{
			cv_dir = -1
			cv_cycle++
		}
		
		else if (cv_step < cv_min & cv_dir == -1)
		{
			cv_dir = 1
			cv_cycle++
		}
		if (cv_cycle > cv_cycle_limit) 
		{
			cv = false
			setTimeout(function(){ocv()},1000)
		}
		else
		{
			console.log(cv_step)
			potentiostat(cv_step)
		}
	}
}


cv_arr = []
cv_comm = ""
hold_array = []
hold_array['x'] = []
hold_array['y'] = []

function cvprocess(data)
{	
	cv_process_out = {}
	foo = data
	last_comm = foo['last_comm']
	if (cv_comm != last_comm & cv_comm != "")
	{
		 cv_comm = last_comm
		 x = 0
		 y = 0
		 for (j = 0; j<hold_array['x'].length;j++ )
		 {
		 	x = x+hold_array['x'][j]
		 	y = y+hold_array['y'][j]
		 }
		 x = x/hold_array['x'].length
		 y = y/hold_array['y'].length
		 hold_array['x'] = []
		 hold_array['y'] = []
		if (cv_arr.length > 0) 
		{
			old_x = cv_arr[cv_arr.length-1][0]
		 	if (Math.abs(x-old_x) > .05) cv_arr.push([null]);
	 	}
		
		cv_process_out = {'V':x,'I':y}

	 }
	 else if (cv_comm == "")
	 {
	    cv_comm = last_comm
		hold_array['x'] = []
		hold_array['y'] = []
		
	 }

	hold_array['x'].push(foo['VOLT'])
	hold_array['y'].push(foo['CURR'])

	return cv_process_out
}

function outputon() {
	toArd(":OUTP ON")
	outputoff = false;
}

//Set to OCV
function ocv()
{
	toArd(":OUTP OFF")
	outputoff = true;
}

//Set Potentiostat
function potentiostat(value)
{
	if(outputoff) outputon()
	toArd(":SOUR:FUNC VOLT")
	toArd(":SOUR:VOLT:MODE FIX")
	cmpl = value/10
	toArd(":SENS:CURR:PROT "+toIEEE754(cmpl))
	toArd(":SOUR:VOLT:LEV " +toIEEE754(value))
}

//Set Galvanostat
function galvanostat(current)
{
	if(outputoff) outputon()
	toArd(":SOUR:FUNC CURR")
	toArd(":SOUR:CURR:MODE FIX")
	toArd(":SOUR:CURR:LEV " +toIEEE754(current))
}

function toIEEE754(ieeenum) {
	if (ieeenum < 0 ) toieee_sign = "-"
	else toieee_sign = "+"
	ieeenum = Math.abs(ieeenum)
	for(i=-37; i<37; i++) {
		if(ieeenum < Math.pow(10,i)) {
			powoften = i - 1
			ieeenum /= Math.pow(10,i-1)
			break;
		}
	}
	return(toieee_sign + ieeenum.toString() + "E" + powoften.toString())
}

//Break Arduino string into useful object
function data_parse(data)
{
	parts = data.split(",")
  	out = {}
	out['VOLT'] = parseIEEE754(parts[0])
	out['CURR'] = parseIEEE754(parts[1])
	out['RES'] = parseIEEE754(parts[2])
	out['TIME'] = parseIEEE754(parts[3])
	return out
}

//************************
//Serial Port Interactions
//************************

function connectToSerial() {
	var SerialPort = require("serialport2").SerialPort
	var serialPort = new SerialPort();
	serialPort.open(process.argv[2], {
		baudRate: 57600,
		dataBits: 8,
		parity: 'none',
		stopBits: 1,
		flowControl: false
	});
	serialPort.write("*RST\r")
	serialPort.write(":OUTP ON\r")
	outputoff = false;
	serialPort.write(":SENS:FUNC:ON \"CURR:DC\"\r")
	serialPort.write(":SENS:FUNC:ON \"VOLT:DC\"\r")
	serialPort.on("data", dataParser);
	return serialPort
}

dataGetter = setInterval(function(){
	if(outputoff == false) {
		queuer.push(":READ?\r");
		if (cv) cv_stepper()
		if (arb_cycling) cycling_stepper()
	}
},s000_sample_rate)

commandWriter = setInterval(function(){
	if (queuer.length > 0)
	{
		sout = queuer.shift();
		try {
			serialPort.write(sout);	
		}
		catch(err) {
			console.log("Failed to send",sout,"to serial port.")
		}
	}
},queue_write_rate)

//toArd: functionally equivalent to queuer.push(command), but slightly
//fancier, since it prints the command and records it as the last command
//sent
var queuer = []
function toArd(command,value)
{
	last_comm = ardupadder(command,value)
	queuer.push(ardupadder(command,value))
	console.log("Sending commands:",queuer)
}

everyxlogcounter = 0
biglogger = 0


//GotData: Called from dataParser every time a new line of data is received
function gotData(data) {
		foo = data_parse(data);
		d = new Date().getTime()	
		foo['time'] = d
		
		if (cv) foo['cv_settings'] = cv_settings
		if (arb_cycling) foo['arb_cycling_settings'] = arb_cycling_settings
		
		if (calibrate)
		{
			calibration_array.push(foo)
		}
		atafile = datafile.replace(".ardudat","")
		if (logger=="started")
		{
			if (db_connected) 
			{
				to_central_info = {}
				to_central_info['filename'] = atafile
				to_central_info['time'] = d
				to_central_info['ard_id'] = foo['id'] 
				if (cv)
				{
					cv_point = cvprocess(foo)
					if (cv_point.hasOwnProperty('V')) db.collection(atafile+"_cv").insert(cv_point)
					
				}
				
				everyxlogcounter++
				if (everyxlogcounter > everyxlog)
				{
					foo['seq_no'] = biglogger
					biglogger++;
					db.collection(atafile).insert(foo)
					db.collection(central_info).update({filename:to_central_info.filename},to_central_info,{upsert:true});
					everyxlogcounter = 0
				}
			}
		}
		else
		{
			biglogger = 0
		}
		foo['logger'] = logger	 	
		foo['datafile'] = datafile
		io.sockets.emit('new_data',{'ardudata':foo} )
		app.set('ardudata',foo)
}

//dataParser: parses raw serial data chunks from ardustat into individual lines
var line = ""
function dataParser(rawdata) {
	data = rawdata.toString();
	if (data.search("\r") > -1)
	{
		line = line + data.substring(0,data.indexOf('\r'));
		gotData(line);
		line = data.substring(data.indexOf('\r')+1,data.length);
	}
	else
	{
		line = line + data;
	}		
}

//****************
//Code for Viewer
//****************

function getStuff_viewer(req,res)
{
	//console.log(req.body.data)
	foo = JSON.parse(req.body.data)
	//console.log(foo)
	view_collection = foo.collection
	
	if (view_collection == "central_info")
	{
	q = foo.query
	l = undefined
	s = {}	
	f = {}
	if (foo.limit != undefined) l = foo.limit
	if (foo.sort != undefined) s = foo.sort
	if (foo.fields != undefined) f = foo.fields
	if (q == '') q = null
	db.collection(view_collection).find(q,f).limit(l).sort(s).toArray(function(err,data)
	{
		res.send({collect:view_collection,data:data})	
	})
	}
	else
	{
		console.log("Plotting collection:",view_collection)
		q = foo.query
		l = undefined
		s = {}	
		f = {}
		if (foo.limit != undefined) l = foo.limit
		if (foo.sort != undefined) s = foo.sort
		if (foo.fields != undefined) f = foo.fields
		if (q == '') q = null
		db.collection(view_collection).find(q,f).limit(l).sort(s).count(function(err,count)
		{
			//console.log(count)
			max_docsish = 500
			if (count > max_docsish)
			{
				ranger = Math.floor(parseFloat(count)/parseFloat(max_docsish))
				q['seq_no'] = {}
				q['seq_no']['$mod'] = [ranger,0]
				
			}
			
			db.collection(view_collection).find(q,f).limit(l).sort(s).toArray(function(err,data)
			{
				if(err) console.log(err)
				else {
				//console.log(data.length)
				res.send({collect:view_collection,data:data})	
			}
			})			
		})
	}

}
