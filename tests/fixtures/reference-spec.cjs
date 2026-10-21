module.exports={
  "schemaVersion": "apollo.screen-spec.v2-experimental",
  "id": "asa014-screen-5plus2",
  "platform": "desktop",
  "viewport": {
    "width": 1600,
    "height": 900
  },
  "root": "corporate-content",
  "nodes": [
    {
      "kind": "component",
      "id": "corporate-content",
      "mappingId": "arui-private.corporate-content.desktop",
      "props": {},
      "slots": {
        "body": [
          "rows"
        ]
      }
    },
    {
      "kind": "stack",
      "id": "rows",
      "direction": "vertical",
      "gap": 24,
      "children": [
        "actions-main",
        "actions-footer"
      ]
    },
    {
      "kind": "component",
      "id": "actions-main",
      "mappingId": "arui-private.buttons-group.desktop",
      "props": {
        "size": "56"
      },
      "slots": {},
      "actions": {
        "port": "button-label",
        "items": [
          {
            "id": "action-1",
            "label": "Кнопка 1",
            "behavior": "none"
          },
          {
            "id": "action-2",
            "label": "Кнопка 2",
            "behavior": "none"
          },
          {
            "id": "action-3",
            "label": "Кнопка 3",
            "behavior": "none"
          },
          {
            "id": "action-4",
            "label": "Кнопка 4",
            "behavior": "none"
          },
          {
            "id": "action-5",
            "label": "Кнопка 5",
            "behavior": "none"
          }
        ]
      }
    },
    {
      "kind": "component",
      "id": "actions-footer",
      "mappingId": "arui-private.buttons-group.desktop",
      "props": {
        "size": "56"
      },
      "slots": {},
      "actions": {
        "port": "button-label",
        "items": [
          {
            "id": "action-save",
            "label": "Сохранить",
            "behavior": "none"
          },
          {
            "id": "action-cancel",
            "label": "Отменить",
            "behavior": "none"
          }
        ]
      }
    }
  ],
  "states": {
    "initial": "default",
    "values": [
      "default"
    ]
  },
  "events": [],
  "transitions": [],
  "unresolved": [],
  "capabilityGaps": []
};
