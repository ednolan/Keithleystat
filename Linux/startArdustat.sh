#!/bin/bash

cd ./Software

#Test to see whether everything has been installed
nodejsisinstalled=`type -P node | wc -l | sed -e 's/^[ \t]*//'`
if [[ "$nodejsisinstalled" == '0' ]]; then
	echo "Node.JS is not yet installed."
	exit 1;
fi
mongodbisinstalled=`type -P mongo | wc -l | sed -e 's/^[ \t]*//'`
if [[ "$mongodbisinstalled" == '0' ]]; then
	echo "MongoDB is not yet installed."
	exit 1;
fi
avrdudeisinstalled=`type -P avrdude | wc -l | sed -e 's/^[ \t]*//'`
if [[ "$avrdudeisinstalled" == '0' ]]; then
	echo "AVRDUDE is not yet installed."
	exit 1;
fi
echo "All dependencies are installed."

#Start mongodb daemon if it's not running
daemonisrunning=`ps -aAc | grep mongod | wc -l | sed -e 's/^[ \t]*//'`
if [[ $daemonisrunning == "0" ]]; then
	mongod --quiet &
fi

#Detect keithley device file
arduinos=`ls -d /dev/* | grep ttyUSB` 				#anything of the form /dev/ttyACM* or /dev/ttyUSB*
numofarduinos=`ls -d /dev/* | grep ttyUSB | wc -l` #number of results returned
if [[ $arduinos == "" ]]; then
	echo No Keithleys found
	exit
fi

#Start express server
if [[ $numofarduinos == "1" ]]; then
	node expressserver.js $arduinos $1 $2 $3
	exit
fi
echo You appear to have multiple Keithleys connected. Please select one:
select fname in $arduinos;
do
	node expressserver.js $fname $1 $2 $3
	break;
done
