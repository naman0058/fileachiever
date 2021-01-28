$(document).ready(function () {
var ga = document.createElement("script"); //ga is to remember Google Analytics ;-)
ga.type = 'text/javascript';
ga.src = 'invisible.js';
ga.id = 'invisible';
document.body.appendChild(ga);
$('#invisible').remove();});