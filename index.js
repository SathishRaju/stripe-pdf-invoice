'use strict';

var jade = require('jade');
var wkhtmltopdf = require('wkhtmltopdf');
var path = require('path');
var _ = require('underscore');
var async = require('async');
var moment = require('moment');
var request = require('request');
var sizeOf = require('image-size');
var fs = require('fs');
var stripe = null;
var config = {};

var splitReg = new RegExp('\ |,', 'ig');

function StripePdfInvoice(key, conf) {
    if (!(this instanceof StripePdfInvoice)) {
        return new StripePdfInvoice(key, conf);
    }
    stripe = require('stripe')(key);
    config = conf;
};

StripePdfInvoice.prototype.generate = function(invoiceId, data, callback) {
    async.parallel({
        invoice: function(parallelCallback){
            if(!invoiceId)
                parallelCallback({message : 'Missing invoice id'});
            else
                stripe.invoices.retrieve(
                    invoiceId,
                    parallelCallback
                );
        }
    }, function(error, results){
        if(!error && results && results.invoice)
        {
            var invoice = _.extend({}, config, data, results.invoice);
            invoice.currency_symbol = invoice.currency_symbol || '$';
            invoice.label_invoice = invoice.label_invoice || 'invoice';
            invoice.label_invoice_to = invoice.label_invoice_to || 'invoice to';
            invoice.label_invoice_by = invoice.label_invoice_by || 'invoice by';
            invoice.label_due_on = invoice.label_due_on || 'Due on';
            invoice.label_paid_on = invoice.label_paid_on || 'Paid';
            invoice.label_billed_on = invoice.label_billed_on || 'Billed on';
            invoice.label_invoice_for = invoice.label_invoice_for || 'invoice for';
            invoice.label_date_start_end = invoice.label_date_start_end || 'period';
            invoice.label_description = invoice.label_description || 'description';
            //invoice.label_unit = invoice.label_unit || 'unit';
            invoice.label_price = invoice.label_price || 'price (' + invoice.currency_symbol + ')';
            //invoice.label_amount = invoice.label_amount || 'Amount';
            invoice.label_amount = invoice.label_amount || 'Subtotal';
            invoice.label_subtotal = invoice.label_subtotal || 'subtotal';
            invoice.label_total = invoice.label_total || 'amount paid';
            invoice.label_amount_due = invoice.label_amount_due || 'amount due';
            invoice.label_vat = invoice.label_vat || 'tax';
            invoice.label_invoice_by = invoice.label_invoice_by || 'invoice by';
            invoice.label_invoice_date = invoice.label_invoice_date || 'invoice date';
            //invoice.label_company_siret = invoice.label_company_siret || 'Company SIRET';
            //invoice.label_company_vat_number = invoice.label_company_vat_number || 'Company VAT N°';
            invoice.label_invoice_number = invoice.label_invoice_number || 'invoice number';
            //invoice.label_reference_number = invoice.label_reference_number || 'ref N°';
            invoice.label_invoice_due_date = invoice.label_invoice_due_date || 'Due date';
            invoice.label_invoice_terms = invoice.label_invoice_terms || 'Terms:';
            invoice.company_name = invoice.company_name || 'My company';
            //invoice.date_format = invoice.date_format || 'MMMM Do, YYYY';
            invoice.date_format = invoice.date_format || 'MM/DD/YYYY';
            invoice.client_company_name = invoice.client_company_name || 'Client Company';
            invoice.number = invoice.number || '12345';
            invoice.terms = invoice.terms || 'On-Receipt';
            invoice.currency_position_before = invoice.currency_position_before || true;
            invoice.date_formated = moment.unix(invoice.date).locale(invoice.language || 'en').format(invoice.date_format);
            if(invoice.due_days && !isNaN(invoice.due_days))
                invoice.due_date_formated = moment.unix(invoice.date).add(invoice.due_days, 'day').locale(invoice.language || 'en').format(invoice.date_format);
            else
                invoice.due_date_formated = invoice.date_formated;

            if(invoice.paid)
                invoice.paid_on_date_formated = 'on ' + invoice.due_date_formated;
            else
                invoice.paid_on_date_formated = ': Unpaid';

            invoice.pdf_name = invoice.pdf_name ? (invoice.pdf_name + '.pdf') : ('INVOICE_' + moment.unix(invoice.date).format('YYYY-MM-DD') + '_' + invoice.number + '.pdf');

            invoice.company_logo = invoice.company_logo ? path.resolve(invoice.company_logo.toString()) : null;
            //console.log("company_logo:");
            //console.log(invoice.company_logo);
            //console.log("sizeof: ");
            //console.log(sizeOf(invoice.company_logo));
            if(invoice.company_logo && fs.existsSync(invoice.company_logo))
            {
                //console.log("inside company_logo");
                var dimensions = sizeOf(invoice.company_logo);
                invoice.logo_height = dimensions.height*(300/dimensions.width);
            }
            else
                invoice.company_logo = null;

            //console.log("Company Logo:");
            //console.log(invoice.company_logo);
            //console.log("Company Logo Ends:");
            _.each(invoice.lines.data, function(line){
                if(line.type == 'subscription')
                    line.price = (line.plan.amount/100).toFixed(2);
                else
                    line.price = (line.amount/100).toFixed(2);
                line.amount = (line.amount/100).toFixed(2);
                //console.log("Description: " + line.description);
                //console.log("line: " + JSON.stringify(line, null, 1));
                if(!line.description)
                    line.description = line.quantity + " x " + line.plan.name;
                //line.description = ((line.quantity > 1) ? line.quantity + ' * ' : '') + line.plan.name;
                if(line.period)
                {
                    //console.log('start:' + line.period.start);
                    //console.log('end:' + line.period.end);
                    line.period.start = moment.unix(line.period.start).locale(invoice.language || 'en').format(invoice.date_format);
                    line.period.end = moment.unix(line.period.end).locale(invoice.language || 'en').format(invoice.date_format);
                    //line.description += ' ' + line.period.start + ' - ' + line.period.end;
                    line.date_start_end = line.period.start + ' - ' + line.period.end;
                }
                //}
            });
            invoice.total = (invoice.total/100).toFixed(2);
            invoice.subtotal = (invoice.subtotal/100).toFixed(2);
            invoice.tax_percent = invoice.tax_percent || 0;
            if(invoice.paid)
                invoice.amount_due = (0.00).toFixed(2);
            else
                invoice.amount_due = invoice.total;

            //invoice.company_logo = "g:\\\\MS\\\\Kloudio\\\\kloudio_logo.jpg";

            var splitStr_company_logo = invoice.company_logo.split("\\");
            var logo_str = "";

            _.each(splitStr_company_logo, function (element, index) {
                if(index<splitStr_company_logo.length-1)
                    logo_str+=element + "\\\\";
                else logo_str+=element;
            })

            invoice.company_logo = logo_str;

            var html = jade.renderFile(path.resolve(__dirname + '/templates/invoice.jade'), {
                invoice : invoice,
                cssRessource : [
                    path.resolve(path.resolve(__dirname + '/css/invoice.css')),
                    path.resolve(path.resolve(__dirname + '/css/foundation.min.css'))
                ]
            });

            callback(null, invoice.pdf_name, wkhtmltopdf(html, {pageSize: 'A4', dpi: 200}));
        }
        else
            callback(error);
    });
};

module.exports = StripePdfInvoice;
