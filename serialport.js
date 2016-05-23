#include "mods.h"

#ifndef INCLUDED_SERIALPORT_JS
#define INCLUDED_SERIALPORT_JS

// Serial I/O Routines.  Abstract Serial I/O details.
var Serial_Objects = new Array (Com1, Com2, Com3, Com4, ComUsb0);

// Constructor for Serial_Port object
function Serial_Port()
{
    this.name = "";
    this.id = -1;
    
    this.TX = Serial_TX;
    //this.RX_Ready = Serial_RX_Ready;
    this.RX_Raw = Serial_RX_Raw;
    this.RX_ASCII = Serial_RX_ASCII;
    this.Clear = Serial_Clear_Buffer;
}

// Constructor for Serial_Settings object
function Serial_Settings()
{
    //Default settings;
    this.Baud = 115200;
    this.DataBits = 8;
    this.Parity = "none";
    this.StopBits = 1;
}

// Initialize serial ports
function Serial_Init(settings)
{
    var i;  //iterate all pre-defined instances of Serial port object
    var j;  //iterate all available instances of Serial object
    var status;
    var ports = new Array;
    
    j = 0;
    for (i = 0; i < Serial_Objects.length; i++) {
        Log.Next = false;
        status = Serial_Objects[i].Initialize();
        if (status == OK)
        {
            Serial_Objects[i].Baud      = settings.Baud     ;
            Serial_Objects[i].DataBits  = settings.DataBits ;
            Serial_Objects[i].Parity    = settings.Parity   ;
            Serial_Objects[i].StopBits  = settings.StopBits ;
            Serial_Objects[i].ClearBuffers();

            ports[j] = new Serial_Port();
            ports[j].name = Serial_Objects[i].name;
            ports[j].id = i;
            Out.Printf(Out.PriNormal, 
                "%s initialized (Baud:%d, DataBits:%d, Parity:%s, StopBits:%d)\n",
                ports[j].name, settings.Baud, settings.DataBits, settings.Parity, settings.StopBits);
            j++;
        }
    }
    return ports;
}

// Uninitialize serial ports.
function Serial_Uninit(ports)
{
    var i;
    for (i=0; i < ports.length; i++) {
        Serial_Objects[ports[i].id].Uninitialize();
        Out.Printf(Out.PriNormal, "%s uninitialized.\n", ports[i].name);
    }
    return OK;
}

// Send message to serial port
function Serial_TX(buffer)
{
    Serial_Objects[this.id].ClearBuffers();
    Serial_Objects[this.id].PutString(buffer);
}

function Serial_Clear_Buffer()
{
    Serial_Objects[this.id].ClearBuffers();
}

function Serial_RX_Ready()
{
    return (Serial_Objects[this.id].ReadBufCount != 0)
}

// Receive message from serial port in Binary mode
function Serial_RX_Raw(buffer)
{
    Serial_Objects[this.id].GetString(buffer);
}

// Receive message from serial port in ASCII mode
//  The response is an array of string. The serial buffer will be read and
//  parsed. All null-terminated strings will be concatenated into a signle
//  string, which will in turn be converted into substrings divided by one or
//  more CR(Carriage Return) or LF(Line Feed) characters.
//  If buffer is not an empty array, the response will append to the array.
function Serial_RX_ASCII(buffer)
{
    //Read back results
    //buffer is an array of strings to be returned;

    var i;
    var newline = true;

    i = buffer.length-1;
    while (Serial_Objects[this.id].ReadBufCount != 0)
    {
        var code = new Array;
        Serial_Objects[this.id].Get(code);   //Get one code
        if (code == 13 || code == 10) {
            //Get a carriage return or line feed character
            newline = true;
        }
        else if (code == 0) {
            //ignore '\0', i.e. concatenate strings.
        }
        else {
            //the rest of the code will be displayed. non-printable char will be converted.
            if (newline == true) {
                buffer[++i] = ""; //Init the first string
                newline = false;
            }
            if (code < 32 || code >= 127) {
                //convert other control chars to question mark.
                buffer[i] = buffer[i] + "?";
            }
            else {
                buffer[i] = buffer[i] + String.fromCharCode(code);
            }
        }
    }

}

#endif// !INCLUDED_SERIALPORT_JS
