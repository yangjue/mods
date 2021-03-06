
#ifndef INCLUDED_E368_JS
#define INCLUDED_E368_JS

#include "mods.h"
#include "serialport.js"
// telnetport.js is imported during runtime, when it is needed, so that pre-existing serial port scripts do not break if telnet is not required


// Changelog:
// 10/ 7/2014 - jmelton - Fixed switch to 115k baud rate. USB->serial should work now (in conjunction with the new serialPort.js that lists ComUsb0)
//  8/27/2013 - jmelton - Now falls-through to trying 115k baud serial even if there was no signature. I think USB->serial might need that.
// 10/15/2012 - jmelton - Added e368_GetVersionString() function since the build version gets chopped-off in the normal GetVersion() function
//  1/17/2011 - jmelton - Reduces sleep times to 200ms from 2000ms
// 12/13/2011 - jmelton - Added Silicon Thermal controller support. Includes TempCtrl_GetTemp(idx) and TempCtrl_SetTemp(temp,idx) functions. Also now forces all set call values to ints, since some floats can cause e368 to freeze
// 11/13/2011 - jmelton - Added Telnet e368 support, requires the "telnetport.js" support script. Interface should be transparent after initialization call
// 11/10/2011 - jmelton - Massive update to include support for version 2.1.3 firmware (and corresponding hardware). 

var e368Debug = false;
var e368verbose = true; // Spews out more printf's than you really need

// e368 Routines. Abstract e368 details.
var PortList;       // a list of available serial ports
var e368List;       // a list of e368 devices. Each channel on a board counts as a separate device, and channels will always be sequential
var e368info;       // array containing info struct on each e368 device (index-matched to e368List)

// Struct for holding info on each e368 device
function e368struct()
{
    this.portName = "ComZ"; 
    this.isOld = true;
    this.e368channel = 1;
    this.version = 1.0;
    this.id = "OldBoard";
}


// Initialize communication with e368 board(s)
//      "optionalIP"    - Tells function to setup a telnet connection with the passed IP
//      return value    - the number of e368 boards found on the system.
//                      The number should be used to determin the valid
//                      port range: [0 thru count-1];
function e368i(optionalIP)
{
    // Check if list of devices needs to be initialized:
    if(e368List == null || typeof(e368List) == "undefined")
    {
        e368List = new Array;
        e368info = new Array;
    }
    // If e368i() is called with the optional IP parameter, use the telnet port init, rather than the serial port search
    if(optionalIP == "" || typeof(optionalIP) == 'undefined')
    {
        return e368_InitSerial();
    }
    else {
        return e368_InitTport(optionalIP);
    }
    
}
Log.Never("e368i");

function e368_InitSerial()
{
    var i;      // iterate available serial port
    var j = e368List.length;  // iterate e368 boards
    
    // Setup communication parameters
    var e368_SerialSettings = new Serial_Settings();
    e368_SerialSettings.Baud = 9600;
    e368_SerialSettings.DataBits = 8;
    e368_SerialSettings.Parity = "none";
    e368_SerialSettings.StopBits = 1;

    // Setup port lists
    PortList = Serial_Init(e368_SerialSettings);

    // First, try finding old e368 boards at 9600 baud rate (heater-only versions use 9600)
    for (i = 0; i < PortList.length; i++) {
        if(e368verbose) Out.Printf(Out.PriNormal, "\nSearching for any e368s on port %s...\n", PortList[i].name);

        // Attempt to detect e368 board on the port using signature "ThermBot>"
        var signature = new Array;
        // Since we can try many different things to find a device, use this variable to hold whetehr we've been successful:
        var portInitialized = false;

        // Ping for e368
        PortList[i].TX("\n\ntinfo\ngettemp\r");
        Sleep( 200 );
        PortList[i].RX_ASCII(signature);
        
        if (signature.length > 0) {
            // Device Response
            if(e368verbose) Out.Printf(Out.PriNormal, "9k Signature = %s\n", signature[signature.length-1]);
            //DebugBuffer(signature);

            // Check signature
            if (signature[signature.length-1] == "ThermBot>") { // last line of reply is the correct prompt
                // Signature match; check temperature reading capability
                var temp = parseFloat(signature[signature.length-2]) / 100;
                if (temp > -15 && temp < 200) {
                    // Add the port to e368 list
                    e368List[j] = PortList[i];
                    e368info[j] = new e368struct();
                    (e368info[j]).isOld = true;
                    (e368info[j]).portName = (PortList[i]).name;
                    (e368info[j]).channel = 1;
                    (e368info[j]).version = e368_GetVersion(j);
                    (e368info[j]).id = e368_GetID(j);
                    Out.Printf(Out.PriNormal, "Old e368 (assigned device index: %d) detected on port %s\n", j, PortList[i].name);
                    portInitialized = true;
                    j++;
                }
                else {
                    // Can't read temperature
                    Out.Printf(Out.PriNormal, "Thermal sensor malfunction or unsupported e368 firmware version on port %s\n", PortList[i].name);
                }
            }
        } // if returned some signature
        if(portInitialized != true) {
            // Signature mismatch- may be caused by wrong baud rate; Try 115200 (used for e368 version 2.1.3)
            signature = [];
            Serial_Objects[PortList[i].id].Baud = 115200; // This is in serialPort.js, but I have no other way of changing the baud post init
            // Re-Ping device at 115k :
            PortList[i].TX("\n\n\ntinfo\ngettemp\r");
            Sleep( 200 );
            PortList[i].RX_ASCII(signature);
            
            if(e368verbose) Out.Printf(Out.PriNormal, "115k Signature = %s\n", signature[signature.length-1]);
            
            // Check new signature at 115k
            if (signature[signature.length-1] == "ThermBot>") { // last line of reply is the correct prompt
                // Signature match; check temperature reading capability on channel 1 (command already sent)
                var temp = parseFloat((signature[signature.length-2]).replace(/^\?/,'')); // e368 ver 2.1.3 had an unknown char at the beginning of the temp data
                if (temp > -15 && temp < 200) {
                    // Add the port to e368 list
                    e368List[j] = PortList[i];
                    e368info[j] = new e368struct();
                    (e368info[j]).isOld = false;
                    (e368info[j]).portName = (PortList[i]).name;
                    (e368info[j]).channel = 1;
                    (e368info[j]).version = e368_GetVersion(j);
                    (e368info[j]).id = e368_GetID(j);
                    Out.Printf(Out.PriNormal, "New e368 (assigned device index: %d) detected on port %s channel 1\n", j, PortList[i].name);
                    portInitialized = true;
                    j++;
                }
                else {
                    // Can't read temperature
                    Out.Printf(Out.PriNormal, "Thermal sensor not readable on port %s at channel 1\n", PortList[i].name);
                }
                
                // Check channel 2
                PortList[i].TX("\n\n\ntinfo2\ngettemp2\r");
                Sleep( 200 );
                PortList[i].RX_ASCII(signature);
                var temp = parseFloat((signature[signature.length-2]).replace(/^\?/,'')); // e368 ver 2.1.3 had an unknown char at the beginning of the temp data
                if (temp > -15 && temp < 200) {
                    // Add the port to e368 list
                    e368List[j] = PortList[i];
                    e368info[j] = new e368struct();
                    (e368info[j]).isOld = false;
                    (e368info[j]).portName = (PortList[i]).name;
                    (e368info[j]).channel = 2;
                    (e368info[j]).version = e368_GetVersion(j);
                    (e368info[j]).id = e368_GetID(j);
                    Out.Printf(Out.PriNormal, "New e368 (assigned device index: %d) detected on port %s channel 2\n", j, PortList[i].name);
                    portInitialized = true;
                    j++;
                }
                else {
                    // Can't read temperature
                    Out.Printf(Out.PriNormal, "Thermal sensor not readable on port %s at channel 2 (probably not connected)\n", PortList[i].name);
                }
            } 
            else { 
                // Signature is not for a new e368 either
                if(e368verbose) Out.Printf(Out.PriNormal, "Something other than an e368 is present on %s\n", PortList[i].name);
            }
        } // end if not good a 9600 baud
        if(portInitialized != true) {
            // Did not respond to e368 commands, try Silicon Thermal command:
            Out.Printf(Out.PriNormal, "%s does not have an e368, checking for a Silicon Thermal controller...\n", PortList[i].name);
            PortList[i].TX("\x02"+"L0100C1"+"\x03\n\r");
            Sleep( 100 );
            PortList[i].RX_Raw(signature);
            
            if (signature.length > 0) {
                var aLine;
                for(var l=0; l<signature.length;l++)
                {
                    aLine =signature[l]; 
                    //Print(aLine);          
                    // does this return value follow the format?  
                    if(aLine[0] == "\x02" && aLine[1] == "L")
                    {
                        // Add the ST port to e368 list
                        e368List[j] = PortList[i];
                        e368info[j] = new e368struct();
                        (e368info[j]).isOld = true;
                        (e368info[j]).portName = (PortList[i]).name;
                        (e368info[j]).version = 1.0;
                        (e368info[j]).channel = 1;
                        (e368info[j]).id = "Silicon Thermal";
                        Out.Printf(Out.PriNormal, "Silicon Thermal controller detected on port %s! Assigned device index %d\n", PortList[i].name,j);
                        portInitialized = true;
                        j++;
                    } 
                    else{
                        Out.Printf(Out.PriNormal, "Unknown device present on %s\n", PortList[i].name);
                    }
                }
            }
            else {
                if(e368verbose) Out.Printf(Out.PriNormal, "No device appears to be present on %s\n", PortList[i].name);
            }
        } // If not reading e368 returns at either 9600 or 115k
    } // foreach port
    
    Out.Printf(Out.PriNormal, "\nFound [%d] temperature controlling device(s).\n\n", e368List.length);
    return e368List.length;
}
Log.Never("e368_InitSerial");     //returning a count. Should not log error.

function e368_InitTport(ipString)
{
    Import("telnetport.js"); // use telnet helper functions
    var j = e368List.length;  // index into list of e368s
    var newPort = new Telnet_Port(ipString); // try to setup port object with passed IP

    // Attempt to detect e368 board on the port using signature "ThermBot>"
    var signature = new Array;
    // Ping device
    newPort.TX("\n\ntinfo\ngettemp\r");
    Sleep( 200 ); // Sleeping here is probably not necessary since the RX is blocking
    newPort.RX_ASCII(signature);
    
    if (signature.length > 0) {
        // Device Response
        if(e368verbose) Out.Printf(Out.PriNormal, "Telnet Signature = %s\n", signature[signature.length-1]);
        
        // Check signature
        if (signature[signature.length-1] == "ThermBot>") { // last line of reply is the correct prompt
            // Signature match; check temperature reading capability on channel 1 (command already sent)
            var temp = parseFloat((signature[signature.length-2]).replace(/^\?/,'')); // e368 ver 2.1.3 had an unknown char at the beginning of the temp data
            if (temp > -15 && temp < 200) {
                // Add the port to e368 list
                e368List[j] = newPort;
                e368info[j] = new e368struct();
                (e368info[j]).isOld = false;
                (e368info[j]).portName = (newPort).name;
                (e368info[j]).channel = 1;
                (e368info[j]).version = e368_GetVersion(j);
                (e368info[j]).id = e368_GetID(j);
                Out.Printf(Out.PriNormal, "New e368 (assigned device index: %d) detected on port %s channel 1\n", j, newPort.name);
                j++;
            }
            else {
                // Can't read temperature
                Out.Printf(Out.PriNormal, "Thermal sensor not readable on port %s at channel 1\n", newPort.name);
            }
            
            // Check channel 2
            newPort.TX("\n\n\ntinfo2\ngettemp2\r");
            Sleep( 200 );
            newPort.RX_ASCII(signature);
            var temp = parseFloat((signature[signature.length-2]).replace(/^\?/,'')); // e368 ver 2.1.3 had an unknown char at the beginning of the temp data
            if (temp > -15 && temp < 200) {
                // Add the port to e368 list
                e368List[j] = newPort;
                e368info[j] = new e368struct();
                (e368info[j]).isOld = false;
                (e368info[j]).portName = (newPort).name;
                (e368info[j]).channel = 2;
                (e368info[j]).version = e368_GetVersion(j);
                (e368info[j]).id = e368_GetID(j);
                Out.Printf(Out.PriNormal, "New e368 (assigned device index: %d) detected on port %s channel 2\n", j, newPort.name);
                j++;
            }
            else {
                // Can't read temperature
                Out.Printf(Out.PriNormal, "Thermal sensor not readable on port %s at channel 2 (probably not connected)\n", newPort.name);
            }
        }
        else {
                // Signature is not for a new e368 
                if(e368verbose) Out.Printf(Out.PriNormal, "Something other than an e368 is present on %s\n", newPort.name);
        }
    }
    else {
        // No response from device
        if(e368verbose) Out.Printf(Out.PriNormal, "No device appears to be present on %s\n", newPort.name);
    }
    return e368List.length;
}
Log.Never("e368_InitTport");

// Set the status as uninitialized.
// Only the ports in operating condition are touched.
function e368c()
{
    //Reset all boards:
    //  - reset mode to fan
    //  - reset target temp to 20
    var devIndx;
    for (devIndx = 0; devIndx < e368List.length; devIndx++) {
        e368_SetTemp(20, devIndx);
        e368_ModeFan(devIndx);
    }
        
    //Uninit serial ports
    Serial_Uninit(PortList);
}

// Report the number of e368 on the system
function e368_count()
{
    if (e368List instanceof Array) {
        return e368List.length;
    }
    else {
        Out.Printf(Out.PriNormal, "==Warning: e368 is not initialized.==\n");
        return 0;
    }
}
Log.Never("e368_count");    //returning a count. Should not log error.

// Send command to e368 board and record response
//      cmd     - string, the command to send, w/o CR/LF
//      result  - an array of string, each for one line of response
//      devIndx    - the id of e368 board.
function e368_SendCommand (cmd, result, devIndx)
{
    // Dont actually try to send e368 commands to the Silicon Thermal controller:
    if(e368info[devIndx].id == "Silicon Thermal")
    {
        return;
    }
    
    var WaitTime = 100;
    var retry = 0;

    if (typeof(cmd) != "string" || !(result instanceof Array) || typeof(devIndx) != "number" )
    {
        Out.Printf(Out.PriNormal, "Usage: e368_SendCommand ([string], [Array], [integer])\n");
        return OK;
    }

    if (e368List instanceof Array && 0 <= devIndx && devIndx < e368List.length) {
        e368List[devIndx].TX (cmd + "\r");     //TX
        Sleep( WaitTime );                  //Wait
        e368List[devIndx].RX_ASCII (result);   //RX
        //Integrity check
        while ((result.length < 1 || result[result.length-1] != "ThermBot>") &&
             retry++ < 10) {
            WaitTime = 150;                     //Try waiting looger
            //result[result.length] = Out.Sprintf ("--->Wait for %d longer<---", WaitTime); //storing this in the result can screw-up parsing
            Out.Printf(Out.PriNormal,"--->Wait %d longer for e368 response<---\n", WaitTime);
            Sleep( WaitTime );                  //Wait
            e368List[devIndx].RX_ASCII (result);   //RX
        }
        if (e368Debug) DebugBuffer(result);
 
        return OK;
    }
    else {
        Out.Printf(Out.PriNormal, "Invalid e368 Board ID:%d...", devIndx);
        Out.Printf(Out.PriNormal, "Only [%d] board(s) are found.\n", e368_count());
        return 780;  //Error 780: Peripheral device not found
   }
}

// Set target temperature of specified e368 board
function e368_SetTemp(temp, devIndx)
{   
    // Protect e368 by not sending crazy-long float values, only ints:
    var tempInt = Math.round(temp); // e368 may freeze without this step
    
    var result = new Array;
    if((e368info[devIndx]).channel == 1)
    {
        e368_SendCommand( "settemp " + tempInt, result, devIndx );
    }
    else {
        e368_SendCommand( "settemp2 " + tempInt, result, devIndx );
    }  
}

// Set temperature threshold of specified e368 board
function e368_SetThresh(temp, devIndx)
{
    var result = new Array;
    
    if((e368info[devIndx]).channel == 1)
    {
        e368_SendCommand( "setthresh " + temp, result, devIndx );
    }
    else {
        e368_SendCommand( "setthresh2 " + temp, result, devIndx );
    }
}

// Get temperature reading 
// If no device index is specified, an array of temps from all available devices is returned
// If a device index is specified, a float for just that device's temp is returned
function e368_GetTemp(devIndx)
{
    var reading;
    var result = -66.0;

    // If no devIndx was specified, get them all
    if(devIndx == null || typeof(devIndx) == "undefined")
    {
        if (e368List instanceof Array) {
            result = new Array;
            for (var devIndx = 0; devIndx < e368List.length; devIndx++) {
                if(e368info[devIndx].id != "Silicon Thermal"){
                    result[devIndx] = e368_GetTemp(devIndx);
                } else {
                    result[devIndx] =0;
                }
            }
        }
    }
    else {
        if((e368info[devIndx]).channel == 1)
        {
            reading = new Array;
            e368_SendCommand( "gettemp", reading, devIndx );
            //DebugBuffer(reading);
            //Response: Line 0 - command echo; 1 - Temperature; 2 - command prompt
            result = parseFloat(reading[1].replace(/^\?/,'')); // e368 ver 2.1.3 had an unknown char at the beginning of the temp data  
            if(e368info[devIndx].version < 2.1)
            {
                result = result / 100.0; // Old e368 reported fractional degrees in integer format
            }
        } 
        else if((e368info[devIndx]).channel == 2)
        {
            reading = new Array;
            e368_SendCommand( "gettemp2", reading, devIndx );
            //DebugBuffer(reading);
            //Response: Line 0 - command echo; 1 - Temperature; 2 - command prompt
            result = parseFloat(reading[1].replace(/^\?/,'')); // e368 ver 2.1.3 had an unknown char at the beginning of the temp data          
            // Only new e368s have channel 2 support, so this will never get divided by 100
        }
    }
    
    return result;
}
Log.Never("e368_GetTemp");

// Mode Setting Functions

function e368_ModePelt( devIndx )
{
    // Dont actually try to send e368 commands to the Silicon Thermal controller:
    if(e368info[devIndx].id == "Silicon Thermal")
    {
        return;
    }
    
    // Default to auto mode on old boards
    if((e368info[devIndx]).isOld)
    {
        Out.Printf(Out.PriNormal, "\n!!WARNING!! You tried to setup peltier mode on an old board. Defaulting to AUTO mode instead\n\n");
        return e368_ModeAuto(devIndx);
    }
    
    // Otherwise, we're ok to set Peltier mode
    var result = new Array;
    if((e368info[devIndx]).channel == 1)
    {
        e368_SendCommand( "setmode pelt", result, devIndx );
    }
    else {
        e368_SendCommand( "setmode2 pelt", result, devIndx );
    }
}
function e368_ModeAuto( devIndx )
{
    var result = new Array;
    if((e368info[devIndx]).channel == 1)
    {
        e368_SendCommand( "setmode auto", result, devIndx );
    }
    else {
        e368_SendCommand( "setmode2 auto", result, devIndx );
    }
}
function e368_ModeFan( devIndx )
{
    var result = new Array;
    if((e368info[devIndx]).channel == 1)
    {
        e368_SendCommand( "setmode fanon", result, devIndx );
    }
    else {
        e368_SendCommand( "setmode2 fanon", result, devIndx );
    }
}
function e368_ModeIdle( devIndx )
{
    var result = new Array;
    if((e368info[devIndx]).channel == 1)
    {
        e368_SendCommand( "setmode idle", result, devIndx );
    }
    else {
        e368_SendCommand( "setmode2 idle", result, devIndx );
    }
}

// Other e368 functions

function e368_IsStable( result, devIndx )
{
    if((e368info[devIndx]).channel == 1)
    {
        e368_SendCommand( "isstable", result, devIndx );
    }
    else {
        e368_SendCommand( "isstable2", result, devIndx );
    }

    if ( result[0] == "true" )
    {
        result[0] = true;
    }
    else
    {
        result[0] = false;
    }
}

function e368_GetSensor( result, devIndx )
{
    var result = new Array;
    if((e368info[devIndx]).channel == 1)
    {
        e368_SendCommand( "getsensor", result, devIndx );
    }
    else {
        e368_SendCommand( "getsensor2", result, devIndx );
    }
}

// Returns a float pertaining to the major and minor rev numbers: m.n in m.n.xxxxx
function e368_GetVersion(devIndx)
{
    var version = 0.0;
    if((e368info[devIndx]).isOld)
    {
        return 1.0; // Call old boards 1.0 since they have no version function
    } 
    else {
        var read = new Array;
        e368_SendCommand( "version", read, devIndx );
        // Split the line of the reply which actually contains the version number (line 1) into chunks delimited by spaces:
        var versionLine = (read[1]).split(/\s/g);
        // Make sure response is what we're looking for- 2nd word should contain "version"
        if((versionLine[1]).search("Version") != -1)
        {
            // Version string is the 3rd chunk (index =2). Then split up the revision indicators
            var versionStr = (versionLine[2]).split(".");
            // Only use the major and minor rev for return value
            var simpleVer = versionStr[0] + "." + versionStr[1]
            return parseFloat(simpleVer);
        }
        else {
            Out.Printf(Out.PriNormal, "Error getting Version. Line read:\n%s\n",read[1]);
        }
    }
    if(e368verbose) Out.Printf(Out.PriNormal, "Version of firmware on e368 at index %d is %f",devIndx,version);
    return version;
}
Log.Never("e368_GetVersion");    //returning a float. Should not log error.


// Returns the full string found pertaining to the firmware version
function e368_GetVersionString(devIndx)
{
    var version = 0.0;
    if((e368info[devIndx]).isOld)
    {
        return 1.0; // Call old boards 1.0 since they have no version function
    } 
    else {
        var read = new Array;
        e368_SendCommand( "version", read, devIndx );
        // Split the line of the reply which actually contains the version number (line 1) into chunks delimited by spaces:
        var versionLine = (read[1]).split(/\s/g);
        // Make sure response is what we're looking for- 2nd word should contain "version"
        if((versionLine[1]).search("Version") != -1)
        {
            // Version string is the 3rd chunk (index =2). 
            var versionStr = (versionLine[2]);
            return versionStr;
        }
        else {
            Out.Printf(Out.PriNormal, "Error getting Version. Line read:\n%s\n",read[1]);
        }
    }
    if(e368verbose) Out.Printf(Out.PriNormal, "Version of firmware on e368 at index %d is %f",devIndx,version);
    return version;
}
Log.Never("e368_GetVersionString");    //returning a float. Should not log error.


// Returns the ID string out of the e368's eeprom 
function e368_GetID(devIndx)
{
    var idName = "ERROR";
    if((e368info[devIndx]).isOld)
    {
        return "OldBoard"; // Call old boards "OldBoard" since they don't have ID functionality
    } 
    else {
        var read = new Array;
        e368_SendCommand( "getid", read, devIndx );
        // Split the line of the reply which actually contains the ID string (line 1) into chunks delimited by spaces:
        var idLine = (read[1]).split(/\s/g);
        // Make sure response is what we're looking for- 1st word should be Device
        if((idLine[0]).search("Device") != -1)
        {
            // ID string is the 3rd chunk (index =2). Then remove the quotes
            idName = (idLine[2]).replace("\"",'');
        }
        else {
            Out.Printf(Out.PriNormal, "Error getting ID. Line read:\n%s\n",read[1]);
        }
    }
    if(e368verbose) Out.Printf(Out.PriNormal, "ID of e368 at index %d is %s\n",devIndx,idName);
    return idName;
}
Log.Never("e368_GetID");    //returning a string. Should not log error.

// Returns a string of the currently assigned IP address
function e368_GetIP(devIndx)
{
    var IPstring = "";
    if((e368info[devIndx]).isOld)
    {
        return "N/A"; // Call old boards N/A since they have no IP function
    } 
    else {
        var read = new Array;
        e368_SendCommand( "dispip", read, devIndx );
        // Split the line of the reply which actually contains the IP address (line 1) into chunks delimited by spaces:
        var ipLine = (read[1]).split(/\s/g);
        // Make sure response is what we're looking for- 2nd word should contain "IP"
        if((ipLine[1]).search("IP") != -1)
        {
            // IP string is the 4th chunk (index =3).
            var IPstring = (ipLine[3]); 
        }
        else {
            Out.Printf(Out.PriNormal, "Error getting IP Address. Line read:\n%s\n",read[1]);
        }
    }
    if(e368verbose) Out.Printf(Out.PriNormal, "IP address of e368 at index %d is %s\n",devIndx,IPstring);
    return IPstring;
}
Log.Never("e368_GetIP");    //returning a string. Should not log error.

// Returns a string of the MAC address currently in the EEPROM
function e368_GetMAC(devIndx)
{
    var MACstring = "";
    if((e368info[devIndx]).isOld)
    {
        return "N/A"; // Call old boards N/A since they have no MAC function
    } 
    else {
        var read = new Array;
        e368_SendCommand( "getmac", read, devIndx );
        // Split the line of the reply which actually contains the MAC address (line 1) into chunks delimited by spaces:
        var retLine = (read[1]).split(/\s/g);
        // Make sure response is what we're looking for- 1st word should contain "MAC"
        if((retLine[0]).search("MAC") != -1)
        {
            // MAC string is the 2nd chunk (index =1)
            var MACstring = (retLine[1]); 
        }
        else {
            Out.Printf(Out.PriNormal, "Error getting MAC Address. Line read:\n%s\n",read[1]);
        }
    }
    if(e368verbose) Out.Printf(Out.PriNormal, "MAC address of e368 at index %d is %s\n",devIndx,MACstring);
    return MACstring;
}
Log.Never("e368_GetMAC");    //returning a string. Should not log error.

// Sets the IP string in the EEPROM to the passed ipString
function e368_SetIP(ipString, devIndx)
{
    if((e368info[devIndx]).isOld)
    {
        Out.Printf(Out.PriNormal, "Error: IP cannot be set on old e368 boards\n\n");
        return; // Call old boards N/A since they have no IP function
    } 
    else {
        var read = new Array;
        e368_SendCommand( ("setip " + ipString), read, devIndx );
        // Split the line of reply, delimited by spaces:
        var retLine = (read[1]).split(/\s/g);
        // Make sure response is what we're looking for- 1st word should be "Saved"
        if((retLine[0]).search("Saved") != -1)
        {
            Out.Printf(Out.PriNormal, "IP successfully set!\n");
        }
        else {
            Out.Printf(Out.PriNormal, "Error saving IP Address. Line read:\n%s\n",read[1]);
        }
    }
    return;
}

// Sets the ID string in the EEPROM to the passed idString
function e368_SetID(idString, devIndx)
{
    if((e368info[devIndx]).isOld)
    {
        Out.Printf(Out.PriNormal, "Error: ID cannot be set on old e368 boards\n\n");
        return; // Call old boards N/A since they have no IP function
    } 
    else {
        var read = new Array;
        e368_SendCommand( ("setid " + idString), read, devIndx );
        // Split the line of reply, delimited by spaces:
        var retLine = (read[1]).split(/\s/g);
        // Make sure response is what we're looking for- 1st word should be "Setting"
        if((retLine[0]).search("Setting") != -1)
        {
            Out.Printf(Out.PriNormal, "ID successfully set!\n");
        }
        else {
            Out.Printf(Out.PriNormal, "Error while saving ID. Line read:\n%s\n",read[1]);
        }
    }
    return;
}

// Sets the MAC address string in the EEPROM to the passed macString
function e368_SetMAC(macString, devIndx)
{
    if((e368info[devIndx]).isOld)
    {
        Out.Printf(Out.PriNormal, "Error: MAC address cannot be set on old e368 boards\n\n");
        return; // Call old boards N/A since they have no IP function
    } 
    else {
        var read = new Array;
        e368_SendCommand( ("setmac " + macString), read, devIndx );
        // Split the line of reply, delimited by spaces:
        var retLine = (read[1]).split(/\s/g);
        // Make sure response is what we're looking for- 1st word should be "Setting"
        if((retLine[0]).search("Saved") != -1)
        {
            Out.Printf(Out.PriNormal, "MAC address successfully set!\n");
        }
        else {
            Out.Printf(Out.PriNormal, "Error while saving MAC address. Line read:\n%s\n",read[1]);
        }
    }
    return;
}

// Returns the device index for the e368. Returns -1 if the id could not be found.
// If multiple channels are being used, this returns the index of channel 1; channel 2 will be <return value> + 1
// Input is a Regex- to ignore case sensitivity while searching for eg: 'Name', set input to: /name/i
function e368_get_index_from_id(idString)
{
    var retIndx = -1;
    for(var i =0; i < e368info.length; i++)
    {
        // Search each e368 struct's ID for the input string
        if((e368info[i].id).search(idString) != -1)
        {
            retIndx = i;
            break;
        }
    }
    return retIndx;
}
Log.Never("e368_get_index_from_id");

// Returns the device index for the e368. Returns -1 if the id could not be found.
// If multiple channels are being used, this returns the index of channel 1; channel 2 will be <return value> + 1
// Input is a Regex- to ignore case sensitivity while searching for eg: 'Name', set input to: /name/i
function e368_get_index_from_ip(ipString)
{
    var retIndx = -1;
    for(var i =0; i < e368info.length; i++)
    {
        // Search each e368 struct's port name for the input ip address (or Com port...)
        if((e368info[i].portName).search(ipString) != -1)
        {
            retIndx = i;
            break;
        }
    }
    return retIndx;
}
Log.Never("e368_get_index_from_ip");

// Display the response from the serial port, mainly for debugging purpose
function DebugBuffer(buffer)
{
    var i;
    Out.Printf(Out.PriNormal, "===Device Info===\n");
    for (i = 0; i < buffer.length; i++) {
        Out.Printf(Out.PriNormal, "%s\n", buffer[i]);
    }
    Out.Printf(Out.PriNormal, "=================\n");
}

function TempCtrl_GetTemp(devIndx)
{
    if(devIndx == null || typeof(devIndx) == "undefined")
    {
        return e368_GetTemp(devIndx);
    }
    
    if(e368info[devIndx].id == "Silicon Thermal")
    {
        return ST_get_temp(devIndx);
    }
    else {
        return e368_GetTemp(devIndx);
    }
}
Log.Never("TempCtrl_GetTemp");

function TempCtrl_SetTemp(newTemp, devIndx)
{
    // Protect devices by not sending crazy-long float values, only ints:
    var tempInt = Math.round(newTemp);
    if(e368info[devIndx].id == "Silicon Thermal")
    {
        ST_set_temp(tempInt,devIndx);
    }
    else {
        e368_SetTemp(tempInt,devIndx);
    }
    
    return;
}
Log.Never("TempCtrl_SetTemp");

function ST_get_temp(devIndx)
{
    var cur_temp = new String;
    var serialStr = new Array;
    var ret_temp;
    //e368List[devIndx].Clear();
    e368List[devIndx].TX("\x02"+"L0100C1"+"\x03");

    Sleep(100);
    e368List[devIndx].RX_Raw(serialStr);
    cur_temp = serialStr[0];
    // Print(cur_temp);

    if(cur_temp[7] == "4")
    {
       if(cur_temp[8] != "0")
       {
         ret_temp = cur_temp[8] + cur_temp[9] +  cur_temp[10] + "." + cur_temp[11] + "C";
       }                                                
       else                
       {
         ret_temp = cur_temp[9] + cur_temp[10] + "." + cur_temp[11] + "C";
       }
    }
    else
    {
       if(cur_temp[8] != "0")
       {
         ret_temp = "-" + cur_temp[8] + cur_temp[9] + cur_temp[10] + "." + cur_temp[11] + "C";
       }
       else
       {
         ret_temp = "-" + cur_temp[9] + cur_temp[10] + "." + cur_temp[11] + "C";
       }
    }

    var val = parseFloat(ret_temp);
    //Print(ret_temp);
    return val;
}
Log.Never("ST_get_temp");     //returning a temp value. Should not log error.



function ST_set_temp(num,devIndx)
{ 
    var isDec = "0";
    var isNeg = "0";
    var i;
    var j;   


    var temp = num.toString(10);//convert from dec to string
    var bleh = new String ;

    if(temp[0] == '-')
    {
        isNeg = "1";      //check for negative number
    }

    if(isNeg =="1")
    {
        temp = temp.replace(/[-]+/g,'');		//remove the negative sign
    }    
    //   Print(temp[0]);
    //   Print(isNeg);
    for(i = 0; i<temp.length; i++)
    {
        if(temp[i] == '.')
        {
            isDec = "1";
        }
    }

    if(isDec == "1")
    {
        temp = temp.replace(/[.]+/g,''); 	//remove decimal point
    }
    else
    {
        temp = temp + "0";
    }

    var k;
    var temptest = temp;
    for(k = 0; k<4-temptest.length; k++)
    {
        temp = "0" + temp;
    }

    //e368List[devIndx].Clear();

    var tempnum;
    if(isNeg == "0")
    {
        tempnum = 579 + parseInt(temp[0]) + parseInt(temp[1]) + parseInt(temp[2]) + parseInt(temp[3]); 
    }
    else
    {
        tempnum = 623 + parseInt(temp[0]) + parseInt(temp[1]) + parseInt(temp[2]) + parseInt(temp[3]);
    }

    //   Print(tempnum);
    bleh = d2h(tempnum);//convert dec to hex
    //   Print(bleh);
    if(isNeg == "0")
    {
        e368List[devIndx].TX("\x02"+"L010200"+temp+"00"+bleh[1]+bleh[2]+"\x03");
    }
    else
    {
        e368List[devIndx].TX("\x02"+"L010200"+temp+"FF"+bleh[1]+bleh[2]+"\x03");
    }
    
    // Clear ST's buffer:
    var garbage = new Array;
    e368List[devIndx].TX("\x02"+"L0100C1"+"\x03");
    Sleep(100);
    e368List[devIndx].RX_Raw(garbage);
    
    return;
}
function d2h(d){return d.toString(16);}


#endif// !INCLUDED_E368_JS
