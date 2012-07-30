//Globals
logger = "stopped";
var options = {
	yaxis: { },
	xaxis: { mode: "time" },
	points: {
		show: false ,
		radius: .5},
	lines: { show: true}
};

var options_viewer = {
	yaxis: { },
	xaxis: { mode: "time" },
	points: {
		show: false ,
		radius: .5},
	lines: { show: true},
	selection: { mode: "x" }
};

var options_cv = {
	yaxis: { },
	xaxis: { },
	points: {
		show: false ,
		radius: .5},
	lines: { show: true}
};


big_arr = []

cv_arr = []
cv_comm = ""
hold_array = []
hold_array['x'] = []
hold_array['y'] = []
last_comm = ""

var socket = io.connect('/');

//Socket Stuff
socket.on('new_data', function (data) {
	fata = data.ardudata
	console.log(fata)
	
	debug_info = ""
	for (var key in fata) { //generate values for debug
		if (fata.hasOwnProperty(key)) {
			debug_info += key + ": " + fata[key] + "<br>"
		}
	}
	$("#debug_info").html(debug_info)
	
	if (fata['cv_settings'] != undefined) cvprocess(fata)
	if (fata['arb_cycling_settings'] != undefined) cyclingprocess(fata)
	
	logcheck(fata)
	cvstatus(fata)
	big_arr.push(data.ardudata)
	
	while (big_arr.length > 100) big_arr.shift(0)
	plot_all(big_arr)
});


//Functions
function logcheck(fata) {
	logger = fata['logger'].toString()
	if (fata['datafile'] != undefined) {
		datafile = fata['datafile'] 
	} 
	else {
		datafile = ""
	}

	if (logger == "started") {
		$("#logger").html("Stop Log")
		$("#log_file_name").text(datafile)
		
		$("#logentrybox").hide()
	
	}
	else if (logger == "stopped") {
		$("#logger").html("Start Log")
		$("#log_file_name").text("")
		$("#logentrybox").show()
	}
}

function cvstatus(fata) {
	if ($("#cvstatus").length > 0 & fata['cv_settings'] != undefined) {
		mata = fata['cv_settings']
		for (var key in mata) {
			if (mata.hasOwnProperty(key)) {
				out_text+=key+": "+mata[key]+"<br>"
			}
		}
		$("#cvstatus").html(out_text);
	}
}

$("#send").click(function() {
	$.ajax({
		type: 'POST',
		dataType: "json",
		async: true,
		url: '/senddata',
		data: {command:$("#mode_choices").val(),value:$("#input").val()},
		success: function(stuff){
			$("#status").html("all good").fadeIn().fadeOut()
		}
	});	
});		

$("#send_directcmd").click(function(){
	$.ajax({
		type: 'POST',
		dataType: "json",
		async: true,
		url: '/senddata',
		data: {directcmd:$("#directcmd_value").val()},
		success: function(stuff){
			console.log(stuff);
		}
	});
});

$("#ocv").click(function() {
	$.ajax({
		type: 'POST',
		dataType: "json",
		async: true,
		url: '/senddata',
		data: {command:"ocv",value:""},
		success: function(stuff){
			console.log(stuff);
		}
	});
});

$("#logger").click(function(){
		if (logger == "stopped") logger = "started"
		else logger = "stopped"
		everyxlog = $("#everyxlog").val()
		console.log(logger);
		$.ajax({
			type: 'POST',
			dataType: "json",
			async: true,
			url: '/senddata',
			data: {logger:logger,datafilename:$("#logfile").val(),everyxlog:everyxlog},
			success: function(stuff){
				console.log(stuff);
			}
		});
});

$("#exportCSV").click(function() {
		$.ajax({
			type: 'POST',
			dataType: "json",
			async: true,
			url: '/senddata',
			data: {exportcsv:db_to_get},
			success: function(stuff){
				console.log(stuff);
				$("#status").html("CSVfiles/"+db_to_get+".csv").fadeIn('slow')
			}
		});
});

$("#startcv").click(function(){
	cv_arr = []
	values = {}
	values['rate'] = $("#rate").val()
	values['v_max']= $("#v_max").val()
	values['v_min']= $("#v_min").val()
	values['v_start']= $("#v_start").val()
	values['cycles']= $("#cycles").val()
	
	$.ajax({
		type: 'POST',
		dataType: "json",
		async: true,
		url: '/senddata',
		data: {command:"cv",value:values},
		success: function(stuff){
			$("#status").html("all good").fadeIn().fadeOut()
		}
	});	
});

//Called whenever the user changes a 'potentiostat/galvanostat'
//dropdown. Changes the rest of the fields so that they match
//what the user has chosen.
$('select.cycle_mode_choices').live("change", function() {
	if ($(this).val() == "galvanostat") {
		thisidnum = $(this).attr('id').substring(2)
		$(".dependent_options").each(function() {
			if($(this).attr('id').substring(2) == thisidnum) {
				$(this).empty();
				$(this).append('\
				Current: <input type="text" id="cycle_value" class="setting_input"> \
				Direction: <select id="cycle_direction"> \
				  <option>charge</option> \
				  <option>discharge</option> \
				 </select> \
				 Cutoff Time: <input type="text" id="cycle_cutoff_time" class="setting_input"> \
				 Cutoff Potential: <input type="text" id="cycle_cutoff_potential" class="setting_input"><br>');
			}
		});
	}
	else if ($(this).val() == "potentiostat") {
		thisidnum = $(this).attr('id').substring(2)
		$(".dependent_options").each(function() {
			if($(this).attr('id').substring(2) == thisidnum) {
				$(this).empty();
				$(this).append('\
				Voltage: <input type="text" id="cycle_value" class="setting_input"> \
				Cutoff Time: <input type="text" id="cycle_cutoff_time" class="setting_input"><br>');
			}
		});
	}
});

function getCyclingJSONs() {
	jsonstrings = []
	$(".cycle_mode_choices").each(function(index) {
		thejson = {}
		thejson["mode"] = $(this).val();
		jsonstrings.push(thejson)
	});
	$(".dependent_options").each(function(index) {
		jsonstrings[index]["value"] = $(this).children("#cycle_value").val()
		if (jsonstrings[index]["mode"] == "galvanostat") {
			jsonstrings[index]["direction"] = $(this).children("#cycle_direction").val()
			jsonstrings[index]["cutoff_potential"] = $(this).children("#cycle_cutoff_potential").val()
			jsonstrings[index]["cutoff_time"] = $(this).children("#cycle_cutoff_time").val()
		}
		else if (jsonstrings[index]["mode"] == "potentiostat") {
			jsonstrings[index]["cutoff_time"] = $(this).children("#cycle_cutoff_time").val()
			jsonstrings[index]["direction"] = "charge"
			jsonstrings[index]["cutoff_potential"] = "0"
		}
	});
	for(i=0; i < jsonstrings.length; i++) { //convert JSON objects to JSON strings
		jsonstrings[i] = JSON.stringify(jsonstrings[i])
	}
	return jsonstrings
}
	
//Sends cycling data to arduino as a list of JSON strings
$("#startcycling").click(function(){
	jsonstrings = getCyclingJSONs();
	$.ajax({
		type: 'POST',
		dataType: "json",
		async: true,
		url: '/senddata',
		data: {command:"cycling",value:jsonstrings},
		success: function(stuff){
			$("#status").html("all good").fadeIn().fadeOut()
		}
	});		
});

$("#startsavedcycling").click(function() {
	thissetting = $("#cyclingpresets").val()
	$.ajax({
		type: 'POST',
		dataType: "json",
		async: true,
		url: '/senddata',
		data: {command:"startsavedcycling",value:thissetting},
		success: function(stuff) {
			$("#status").html("all good").fadeIn().fadeOut()
		}
	});
});

//Adds a new cycle command. This consists of 2 separate html parts:
//a dropdown <select> with id o-# and a <div> containing the rest of the
//fields with id c-#, where # is an integer 'id number'
$("#addrow").click(function() {
	$("#remrow").removeAttr("disabled")
	$(".dependent_options").each(function() {
		thisidnum = parseInt($(this).attr('id').substring(2)) //ID number of last element
	});
    cycle_select = $("#c-"+thisidnum).clone() //Clone last element
    if ($("#c-"+thisidnum).val() == "galvanostat") { //Prevent bug where cloned dropdown would be wrong
		cycle_select.val('galvanostat')
	}
    cycle_options = $("#o-"+thisidnum).clone()
	cycle_select.attr('id','c-'+(thisidnum+1));
	cycle_options.attr('id','o-'+(thisidnum+1));
	$("#o-"+thisidnum).after(cycle_select);
	$("#c-"+(thisidnum+1)).after(cycle_options);
});

$("#remrow").click(function() {
	$(".dependent_options").each(function() {
		thisidnum = parseInt($(this).attr('id').substring(2)) //ID number of last element
	});
	if(thisidnum == 1) {
		$(this).attr("disabled","true")
	}
	else if (thisidnum == 2) {
		$(this).attr("disabled","true")
		$("#c-"+thisidnum).remove()
		$("#o-"+thisidnum).remove()
	}
	else {
		$("#c-"+thisidnum).remove()
		$("#o-"+thisidnum).remove()
	}
});

//Saves cycling information
$("#cyclingsave").click(function(){ 
	myprogram = getCyclingJSONs();
	values = {name:$("#cyclingname").val(),program:myprogram}
	console.log(values)
	$.ajax({
		type: 'POST',
		dataType: "json",
		async: true,
		url: '/senddata',
		data: {programs:"cyclingsave",value:values},
		success: function(stuff){
			fillprograms(stuff)
			$("#status").html("all good").fadeIn().fadeOut()
		}
	});
});

cycling_programs = {}

function fillprograms(stuff)
{
	out = ""
	for (var i = 0; i < stuff.length;i++)
	{
		cycling_programs[stuff[i]['name']] = stuff[i]['program']
		out+="<option>"+stuff[i]['name']+"</option>" 
	}
	$("#cyclingpresets").html(out)
}

$("#cyclingpresets").change(function()
{
	$("#cyclingtext").val(cycling_programs[$("#cyclingpresets option:selected").text()])
})

if 	($("#cyclingpresets").length == 1) {
	$.ajax({
		type: 'POST',
		dataType: "json",
		async: true,
		url: '/senddata',
		data: {programs:"cyclingpresetsget",value:{}},
		success: function(stuff){
			fillprograms(stuff)	
		}
	});
}

function cyclingprocess(data) {
	if ($("#cyclingtext").length == 1) {
		if ($("#cyclingtext").val() == "") {
			this_foo = data['arb_cycling_settings']
			console.log(this_foo)
			out = ""
			for (var i=0; i < this_foo.length; i++) {
				out += JSON.stringify(this_foo[i])+"\n"
			}
			$("#cyclingtext").val(out)		
		}
	}
}

function cvprocess(data) {
	foo = data
	last_comm = foo['last_comm']
	if (cv_comm != last_comm & cv_comm != "") {
		cv_comm = last_comm
		x = 0
		y = 0
		for (j = 0; j<hold_array['x'].length;j++ ) {
			x = x+hold_array['x'][j]
			y = y+hold_array['y'][j]
		}
		x = x/hold_array['x'].length
		y = y/hold_array['y'].length
		hold_array['x'] = []
		hold_array['y'] = []
		if (cv_arr.length > 0) {
			old_x = cv_arr[cv_arr.length-1][0]
			if (Math.abs(x-old_x) > .05) cv_arr.push([null]);
		}
		cv_arr.push([x,y]);

		//io.sockets.emit('cv_data',{'cv_data':cv_arr} )
		$.plot($("#flot_cv"), [cv_arr],options_cv);

		//console.log(cv_arr)
	 }
	 else if (cv_comm == "") {
		cv_comm = last_comm
		hold_array['x'] = []
		hold_array['y'] = []
	 }
	hold_array['x'].push(foo['VOLT'])
	hold_array['y'].push(foo['CURR'])
}

function grabData(dict) {
	dict = JSON.stringify(dict)
	$.ajax({
		type: 'POST',
		dataType: "json",
		async: true,
		url: '/getdata',
		data: {'data':dict},
		success: function(stuff){		
			if ($("#central_info").length > 0 & stuff['collect'] == 'central_info') listCollections(stuff)
			else if ($("#plots").length > 0 ) plot_all(stuff['data'])
			else {
				console.log("what the hell do I do with this")
				console.log(stuff)
			}
		}
	});
}

function grabData_viewer(dict) {
	dict = JSON.stringify(dict)
	$.ajax({
		type: 'POST',
		dataType: "json",
		async: true,
		url: '/getdata_viewer',
		data: {'data':dict},
		success: function(stuff){		
			if ($("#central_info").length > 0 & stuff['collect'] == 'central_info') listCollections(stuff)
			else if ($("#plots").length > 0 ) plot_all_viewer(stuff['data'])
			else {
				console.log("what the hell do I do with this")
				console.log(stuff)
			}
		}
	});
}

function plotlinker(filename)
{
	return '<a href="/plotter/'+filename.replace("%","%25")+'">'+filename+'</a>'
}

function listCollections(stuff) {
	stuff = stuff['data']
	out_text = "<table>"
	for (j = 0; j < stuff.length;j++) {
		out_text+="<tr><td>"+plotlinker(stuff[j]['filename'])+"</td><td>"+new Date(stuff[j]['time']).toLocaleString()+"</td></tr>"
	}
	out_text += "</table>"
	$("#central_info").html(out_text)
}


function flotformat(source,xlab,ylab) {
	start = source[0][xlab]
	end = source[source.length - 1][xlab]
	diff = Math.abs(start - end)
	avdiff = diff/source.length
	var i, l,
		dest = [],
		row;

	for(i = 0, l = source.length; i < l; i++) { 
		row = source[i];
		if (i > 0) {
			if (Math.abs(source[i][xlab] - source[i-1][xlab]) > avdiff*10) {
				dest.push("null")
			}
		}
		dest.push([row[xlab], row[ylab]]);
	}
	return dest;
}

function plot_all(data) {
	foo = data;
	if ($("#flot_potential").length >0) {
//			console.log($("#flot_potential").length )
		flotfoo = []   
		flotfoo.push({'data':flotformat(foo,'time','VOLT'),'label':'Voltage','color':'red'});
		$.plot($("#flot_potential"), flotfoo,options);
	}
	if ($("#flot_current").length > 0) {
		flotfoo = []   
		flotfoo.push({'data':flotformat(foo,'time','CURR'),'label':'Current','color':'red'});
		$.plot($("#flot_current"), flotfoo,options);
	}
}

function plot_all_viewer(data) {
	foo = data;
	if ($("#flot_potential_viewer").length >0) {
//			console.log($("#flot_potential").length )
		flotfoo = []   
		flotfoo.push({'data':flotformat(foo,'time','VOLT'),'label':'Voltage','color':'red'});
		$.plot($("#flot_potential_viewer"), flotfoo,options_viewer);
	}
	if ($("#flot_current_viewer").length > 0) {
		flotfoo = []   
		flotfoo.push({'data':flotformat(foo,'time','CURR'),'label':'Current','color':'red'});
		$.plot($("#flot_current_viewer"), flotfoo,options_viewer);
	}
}
