// url=https://www.figma.com/design/I3MsagXR8Tz2eZcGtIgUk8/%E2%9D%87%EF%B8%8F-%D0%9C%D0%B0%D1%81%D1%82%D0%B5%D1%80%D1%81%D0%BA%D0%B0%D1%8F----AI?node-id=8962-21756
// source=src/ui-app/components/Button.tsx
// component=Button
import figma from 'figma';

const instance = figma.selectedInstance;

const labelText = instance.findText('Label');
const label = labelText.type === 'TEXT' ? labelText.textContent : 'Label';
const type = instance.getEnum('type', {
  primary: 'primary',
  secondary: 'secondary',
});
const disabled = instance.getEnum('disabled', {
  false: false,
  true: true,
});
const singleIcon = instance.getEnum('singleIcon', {
  false: false,
  true: true,
});
const size = instance.getEnum('Compact', {
  false: 'regular',
  true: 'compact',
});
const icon = instance.findInstance('LeftAddon', { traverseInstances: true });
let iconCode;

if (icon && icon.type === 'INSTANCE') {
  iconCode = icon.executeTemplate().example;
}

export default {
  example: figma.code`
    <Button
      label="${label}"
      type="${type}"
      size="${size}"
      ${disabled ? 'disabled' : ''}
      ${singleIcon ? 'singleIcon' : ''}
      ${singleIcon && iconCode ? figma.code`icon={${iconCode}}` : ''}
      onPress={() => {}}
    />
  `,
  imports: ['import { Button } from "./Button";'],
  id: 'apollo-button',
  metadata: {
    nestable: true,
  },
};
