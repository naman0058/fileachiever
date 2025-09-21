var http = require('http'),
    fs = require('fs'),
    ccav = require('./ccavutil'),
    qs = require('querystring');




exports.postReq = function(req,response){
    var body = '',
	workingKey = '3F831E8FD26B47BBFDBCDB8E021635F2',	//Put in the 32-Bit key shared by CCAvenues.
	accessCode = 'AVZN72JL86AQ28NZQA',			//Put in the Access Code shared by CCAvenues.
	encRequest = '',
	formbody = '';
				
    // request.on('data', function (data) {
	// body += data;
	// encRequest = ccav.encrypt(body,workingKey);
    

    const orderParams = {
        order_id: 8765432,
        currency: 'INR',
        amount: '100',
        redirect_url: encodeURIComponent(`http://localhost:3000/api/redirect_url/`),
        billing_name: 'Name of the customer',
        // etc etc
      };

    const encryptedOrderData = ccave.getEncryptedOrder(orderParams);
console.log(encryptedOrderData);


	formbody = '<form id="nonseamless" method="post" name="redirect" action="https://secure.ccavenue.com/transaction/transaction.do?command=initiateTransaction"/> <input type="hidden" id="encRequest" name="encRequest" value="' + encryptedOrderData + '"><input type="hidden" name="access_code" id="access_code" value="' + accessCode + '"><script language="javascript">document.redirect.submit();</script></form>';
    // });
				
    request.on('end', function () {
        response.writeHeader(200, {"Content-Type": "text/html"});
	response.write(formbody);
	response.end();
    });
   return; 
};
