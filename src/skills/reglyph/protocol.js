'use strict';
const SCHEMA = 'apollo.reglyph.v1';
const OPERATIONS = new Set(['ready','reset','scan','scenario','go-to','preview','icon-preview','flush-previews','clear-preview-cache','replace']);
function contextValid(value) {
  return value && Object.keys(value).length === 2 && ['b2b','b2c','site','invest'].includes(value.channelId) && ['Desktop','MobileWeb','iOS','Android'].includes(value.pickerLabel);
}
const supported = context => contextValid(context) && ['iOS','Android'].includes(context.pickerLabel);
const contextKey = context => context.channelId + ':' + context.pickerLabel;
module.exports = {SCHEMA, OPERATIONS, contextValid, supported, contextKey};
