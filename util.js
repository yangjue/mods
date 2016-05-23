//setTemp.js to set E368 to a target temperature
//Original Author: Jimmy Zhang
//Create Date:2013.11.20

#include "TEMPS.js"
#include "e368Interface.js"



var pt;
function start()
{
  pt = e368i()-1;
}
function GetTemp()
{
    var chan = arguments[0];
    
    var temp; 
	temp = e368Inter_GetTemp(chan, pt)
    Out.Printf(Out.PriHigh, "\n#************************************************************#\n\n");
    Out.Printf(Out.PriHigh, "  Get GPU temperature:%f",temp);
	return temp;

}
Log.Never("GetTemp");
function SetTemp()
/*[0]  channel  [1] val */
{
    var chan = arguments[0];
    var target_temp = arguments[1];

    Out.Printf(Out.PriHigh, "\n#************************************************************#\n\n");
    e368Inter_SetTemp(target_temp, chan, pt);
    Out.Printf(Out.PriHigh, "  Set GPU to Target temperature:%f",target_temp);

}
function SetModePelt()
{
    var chan = arguments[0];
    e368Inter_ModePelt(chan,pt)
    Out.Printf(Out.PriHigh, "\n#************************************************************#\n\n");
    Out.Printf(Out.PriHigh, "  Set %d Channel ModePelt ",chan);
}
function SetModeAuto()
{
    var chan = arguments[0];
    Out.Printf(Out.PriHigh, "\n#************************************************************#\n\n");
    e368Inter_ModeAuto(chan,pt);
    Out.Printf(Out.PriHigh, "  Set %d Channel ModeAuto ",chan);
}
function SetModeFan()
{
    var chan = arguments[0];
    Out.Printf(Out.PriHigh, "\n#************************************************************#\n\n");
    e368Inter_ModeFan(chan,pt);
    Out.Printf(Out.PriHigh, "  Set %d Channel ModeFan ",chan);
}
function SetModeIdle()
{
    var chan = arguments[0];
    Out.Printf(Out.PriHigh, "\n\n#************************************************************#\n\n");
    e368Inter_ModeIdle(chan,pt);
    Out.Printf(Out.PriHigh, "  Set %d Channel ModeIdle ",chan);
}
function SetThresh()
{
    var chan = arguments[0];
    var val  = arguments[1];
    Out.Printf(Out.PriHigh, "\n#************************************************************#\n\n");
    e368Inter_SetThresh(chan,val,pt);
    Out.Printf(Out.PriHigh, "  Set %d Channel Thresh %f",chan,val);
}
