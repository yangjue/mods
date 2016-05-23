
#ifndef INCLUDED_TEMPS_JS
#define INCLUDED_TEMPS_JS

#include "mods.h"
//#include "e368.js"

// Changelog:
//  2/28/1023 - jmelton - Changed min temp to -5, and dropped acceptable difference back to +2
// 10/16/2012 - jmelton - Increased acceptable temperature difference to 3 degrees from 2 degrees
// 10/15/2012 - jmelton - Added firmware version check to see if rate throttling is required by software. Firmware versions greater than 2.1.4 will no longer have software pauses.
// 12/13/2011 - jmelton - Now uses new TempCtrl versions of setTemp and getTemp so that the Silicon Thermal controller can be supported. Added function that breaks-down a temperature change into steps with pauses in-between so that thermal heads are less likely to get damaged by having hteir temp change too quickly.


//Set system temperature
function setTemp(temp,channel, port)
{
    var start_temp;     //Record the initial temperature
    var wait_time;      //wait time, in seconds
    var delta;          //Record the difference from target
    var isThrottled; // Inserts pauses every 10 degrees to reduce wear on thermal head. Is set based on firmware version.
    const L = -1;       //lower tolerance bound
    const H = 2;        //upper tolerance bound

    const T2L = -11;    //tolerance for Test 2 heating
    const T2H = 10;     //tolerance for Test 2 heating
    const T2Loops = 50; //Max # of Test 2 loops to run to assist heating up


    // Check parameter validity
    if (typeof(port) != "number" || port >= e368_count() ) {    //invalid port #
        return 780;  //Error 780: Peripheral device not found
    }
    if (typeof(temp) != "number" || temp < -20 || temp > 200) {   //invalid target
        Out.Printf(Out.PriNormal,"\n\n===Error: Attempted to set bad temperature: %f.===\n\n", temp);
        return;
    }
    
    var firmwareVersion = e368_GetVersionString(port);
    if(firmwareVersion >= "2.1.4")
    {
        isThrottled = false;
    } else {
        isThrottled = true;
    }
    

    // Set target temperature and change e368 to auto mode
    e368_SetThresh(130, port);
    e368_ModePelt(port);
    
    // Prevent temp from changing too quickly (causing thermal head damage):
    var curTemp = getTemp(port);
    var start_temp = curTemp;
    var tempStep = curTemp;
    
    if(isThrottled)
    {
        Sleep(1000);
        for(var step=1; step < (Math.abs(temp - start_temp) / 10.0); step++)
        {
            curTemp = tempStep; //Math.round(tempStep); // THIS IS ABSOLUTELY NECESSARY. e368 can't handle full floats
            tempStep = (temp > curTemp) ? (curTemp + 10) : (curTemp - 10);
            TempCtrl_SetTemp(tempStep, port);

            wait_time = 120;
            Out.Printf(Out.PriNormal, "\nWaiting up to %d minute(s) to reach intermediate temp of %.02f...\n", wait_time/60,tempStep);
            delta = WatchTemp(port, L, tempStep, H, wait_time, undefined);  
            if(delta != 0) break;
            if(Math.abs(temp - curTemp) > 10) 
            {
                Out.Printf(Out.PriNormal, "\nIdling for 8 seconds to reduce wear on thermal head...\n");
                Sleep (8000);   
            }
        }
    }
    
    TempCtrl_SetTemp(temp, port);
    wait_time = 180;
    Out.Printf(Out.PriNormal, "\nWaiting up to %d minute(s) to reach final temperature of %.02f...\n", (wait_time/60), temp);
    delta = WatchTemp(port, L, temp, H, wait_time, undefined);  
    
    
    //if (delta == 0) {       //temperature reached the target
        return OK;
    //}

    //2. If not reaching target, check if temperature is changing at all.
    //if (WatchTemp(port, L, start_temp, H, 0, undefined) == 0) {
        //temperature is still near the initial value
    //    panic("Temperature not changing, waiting for reboot...\n", temp , port);
     //   e368_ModeFan(port);
     //   return 263;     //263 couldn't reach target temperature
    //}
    //else {
        //temperature changed but slowly
    //    if (delta < -7) {       // temperature is way below target
            // Try heating up using Test 2
    //        delta = WatchTemp(port, T2L, temp, T2H, T2Loops, Test2Burn);
    //    }
    //}

    //3. Wait 3 more minutes
    //wait_time = 180;
    //Out.Printf(Out.PriNormal, "Waiting up to %d minute(s) to reach temperatures...\n", wait_time/60);
    //delta = WatchTemp(port, L, temp, H, wait_time, undefined);
    //if (delta == 0) {       //temperature reached the target
    //    return OK;
    //}
    //else {
    //    panic("Temperature did not reach target after 5 minutes!\n", temp, port)
    //    return 263;         //263 couldn't reach target temperature
    //}
}

// Read the temperature
//      port        - the id of e368 board.
//      return value:
//                  - the tempearature read.
function getTemp(port) {
    var tries = 0;
    var result;

    //Read temp from e368
    result = TempCtrl_GetTemp(port);
    Out.Printf(Out.PriHigh, "%.2f; ", result);

    //Check validity of the reading
    while( tries < 5 && !(result > -15 && result < 200) ) {
        Out.Printf(Out.PriNormal,"Got bad temperature: %s\n",result);
        e368Debug = true;
        Sleep(500);
        tries++;
        result = TempCtrl_GetTemp();
    }
    if(tries >= 5) {
        panic(Out.Sprintf("GPU is not returning sane temperatures!\n"), result, port);
    }
    else {
        e368Debug = false;
    }
    return result;
}
Log.Never ("getTemp");  //returning a number. Should not log error.

function panic(message, temp, port) {
    var result = new Array;
    e368_ModeFan(port);
    Out.Printf(Out.PriNormal, message);
    tempLog = new File("temp.txt");
    fileOpen = tempLog.open("text", "write,append,create");
    TempCtrl_GetTemp(result, port);
    //result[port] = adfc_getremotetemp();
    tempLog.write(new Date());
    tempLog.write( " Set: " + temp );
    tempLog.write( " Current: " + result[port] );
    tempLog.write( " panic ****\n");
    tempLog.close();
    //while(1) Sleep(1000);
    //return 999;
    return 263;         //263 couldn't reach target temperature
}


// Watch the temperature change to see if the temperature reaches a certain range.
// Timeout if it takes too long.
//      port        - the id of e368 board.
//      L,target,H  - The target temperature and tolerance. If the temperature
//                  is within the range [target+L, target+H], it is
//                  considered as reaching target.
//                  Note: generally L < 0 and H > 0, but it works as long as L<H.
//      wait_sec    - The max amount of time to wait. If 'fn_wait' is 'undefined',
//                  the unit is second, otherwise it the number of loops to run
//                  the specified function every second; minimum 1 sec or 1 loop.
//      fn_wait     - A function to execute while waiting; can be 'undefined'
//      Return value:
//                  - 0 if reached target, otherwise the difference from the target
function WatchTemp(port, L, target, H, wait_sec, fn_wait)
{
    var reading;
    var i = 0;

    do {
        Sleep(1000);        // wait for 1 sec to read temperature
        reading = getTemp(port);
        if ((target + L) < reading && reading < (target + H)) {
            return 0;       // reaching target
        }
        else {              // otherwise take proactive actions if available.
            if (typeof(fn_wait) == "function") fn_wait();
        }
        i++;
    } while (i < wait_sec);
    return reading - target;
}
Log.Never ("WatchTemp");  //returning a number. Should not log error.

function Test2Burn()
{
    var subdev = new GpuSubdevice(0,0);
    var volt = subdev.Perf.CoreVoltageMv;
    subdev.Perf.CoreVoltageMv = 1050;
    RunTest(2);
    subdev.Perf.CoreVoltageMv = volt;
}

#endif// !INCLUDED_TEMPS_JS
