import type { AuditItem, DetachedEntry } from '../types/audit';

const SHELL_COMPONENT_KEYS = [
  // Web _ Corp Components -- CorporateAppHeaderNew [D]
  'd187029a0a1af08dbb499e13b3ef2ac98efaaac2',
  '0718f1e72a3a298e20cd7597a896e249bf516a2d',
  '04a68b027b0dfe7e7b2edd5d57113e6ec6620427',
  '1e17bf796b55a428c23f61cc40dd046ce782717a',
  '1c3587574c6bba475de964eba4faf124ec5e3464',
  '379ded7ba661ce24eaedeb43cf38f117fd89be96',
  '3fd50fe48ed8ce51ff236a54525ed6ec90b073c9',
  'e451869608a4f768a0376c41f233d41d91e7cb3e',
  '18afe356fff5b5b7dee60e2d65c83ff7c0d4abb3',
  'd47d8e934e209b05178a494698bc7f92c3578601',
  '9d78f07de2c46a0c9b0254838a3fddbccc17da4f',
  'fb68338def15945681b63fb5fdd66e2762e9254f',
  '270c4fad625a45db2e41bb2a15a54a14cbfcca66',
  'cb88e0757a938a10fd3e03af6598c8b01f226d0e',
  '4d3df57943e8a7dc049529262dcb26054276750e',
  '736d5c09f32580de3fc307e44eea2f3fadf77077',
  '36757f78ef30e51ec0315cc1367822e26eeb2a3f',
  'f2dfdad5655f459cc9ba62db6add21f440f47e5c',
  '47344e201c3dbb9f22e5b26bb57455c7bba80b12',
  '74155c47771dd62722753cacc58ff235d3020110',
  '411b35e4620612890136897bf13fdee3d6c6ca72',
  'e0f4c7e283e00ee99814f2d2d79bfa1483b1edc5',
  'a3b74fa3b6c4f6a739dcaca9810dc45a4ce01f26',
  '7427554e76434470eda7ae446e6ee6e8b150f834',
  '1c06ea4bba38b12d5025bf0a5afd2a983307528d',
  '794318234055b2cd0e5e51c881381737874689d4',
  '7e80cdadf8d7845bb273f1a6f24e9b777954dcb7',
  'd019df22b006bea99332f4b5d11961c8f34770a0',
  '8efa48b511de950fcba9b8e74e954cdacdd33690',
  '5e96e2b1dbaed0c09e90aead68b8fb4824b566b7',
  'ab9f5d85953265c4e52585ba24ed52db522934b6',
  '84ed2c2059dd222abbd3d9ee50220ac3f2efe43e',
  'cc3763f592809cc2664adccb4ee29cf253a85467',
  'c313f1c40e697d87c2f2b9f2f1f963cf07750676',
  'cf4ceb2affed27bf33d8fab9cd6a49bed42d56b3',
  'e10ab9bf79dbd78eb165e65ac9205af8c5012600',
  'de526300709a95ff4eaed668f0ee75270093c46c',
  '926ab7fbf5ef8dad1c0cd74848f041bf2bc32f0d',
  'f77a955b375c0bb83f8b80d69e449e3e3c3f9580',
  'a52e8dbee451ba0c98f4b6fe0f8ecea01ecf12da',
  '7aad5a3f19aee95678ad55ff688498260b68575f',
  'd326c685daa1e6c7429655372ad60f4ccf047e11',
  '2b442e873b6c052de8ffa4144b8a25c6c4a1b875',
  'a4a04206ba6fa4e0eee62a65ee3a14abe3498cf6',
  'a195beb0df626938924eddbe00b79f0ad426d3f4',
  '872c8aa3fcd56bfd2bfb37e413237dd6e9a4177f',
  '3c1cf0b928cff00637aa8e21bbae5cb7ec764d73',
  '65aac550229ddf24796afa8009e7c1e7c68df529',
  '68e17756d489c419acb1278d6add8b3451bd3579',
  'f22ef205716e2365996e6b34ebdefd037e665003',
  '2363b35db5c5127066c195c43f1298cb480b0b2d',
  '5f8fe3b179a3cb96bf53cf73ac2d86ad1b622e28',
  '8a86dbd319616b934ff861c78c04fe7767525887',
  'ea2e6f4739b24e0eb395da1f06c71f4ac635be2e',
  'bbef2191519dd54476f8bc08e5bd1eaf96b607f3',
  '824b73157184ab7c679696e2d6341921c76f37c0',
  '467f51a6f1b15002516aa27574468c9ad08c52f7',
  'ca769e5435d29ec4de3888dcd85c496ff3f9af35',
  '2d14895e351fa7a25a3e802f09a77ac3207de4f4',
  '180dae909e23f816165111fb7c61bced95f47d12',
  'c81e218fddac4c762990c93efb9d37d29b703424',
  '8240124a3ab05dc69bd151e33aee6b6c4d15f266',
  '0418a5dd22fe8508554531c5fae562727f6649c8',
  'c9fd2a2cb700f1a8ac07f503936acb3cdb52c36a',
  '6cd56446859c4e9f07e5d949e3f5d83095463466',

  // Web _ Corp Components -- CorporateAppHeaderMobile [M]
  '92afbeecae84ff7ba5815a20b34cc7c80394f0c5',
  'a9d4567dba68ceedf3b3e10539ea40f478934320',
  '16b430d14caf4e1b3b5ceabd5ef58865259e1399',
  '1b6ce5a6474cc691355f8945a765da3d45d46bd0',
  '86256a90cf4ce31284f583955ec1224b148e15b4',
  '6e167ea6b85c024d3370e40c7d87a29f327b3d6c',
  'b7bb4d236678826d34c8fe26b57a731bd7b5e1fe',
  '005acbec3262f5f6a820216b4fa3aa788979f409',
  'b0a77176b78b32dc2a536ab2c5e9806ed992c10b',
  'c70ff1e477addfe8090dbb8394488d2b27344ff5',
  '4f1a270f495b7d36dca9dbc77a1d24f01c3ec4e0',
  '6e6853dd7324d490085528461ace1a1bdf5ebd1d',
  '2ba8cc60ed4dd3e4aa9557c0be02be93142f5dbe',
  '3b689e64c3f6a48c7cd3466b5bf5953860812b82',
  '238ccd5dcf204b085355fae23d152e1727140c7b',
  '37e54f03ed357cd456f5ff244e9dcb7e8aecd388',
  '8313846414f0c6e9d18af15fbd13c855bd73f74c',
  '6b10b4361988311c4e6c87f8fb4e8ee7e8011e1d',
  '9bc4705e1455f63b0ccd0bb34b0753058afc00ec',
  '19d770901db423dda1dd5e2ee65d029f11d0e802',
  '9169adf00b0e1d2e7cba3c7e8a6170690a56f0e8',
  '8e7298a8f66f1cc9adaa1ef7480a5db291d3e1ce',
  'c08c37ecbd54077ae1d3b4e971c6ece8e75182f0',
  '49a2993a16ace7df6d67342c1a6eaf57a830c07a',
  '0a8e127814f572a79ddd9beec8ece3e63c7a87d6',
  '582753bd35196028b978ba2b047a21eb1106b254',
  'ca79197cbee7896d0775639ae74d5648e1c54f6d',
  '37894241a21b61f4bbd954ba60ed59c74d8cfcf3',
  '436c2c6c87f54a763382c77863d9140da37dd799',
  'de259bf94d804609be42178ec341411899e3970f',
  'd74be1cd7ae12a07c0db6c7a46e98d313794ecb1',
  '60be5c9cd3399295010cf436aef98a81b8d11667',
  '49ea56ee3d4e07551b708288f87483db138d4b19',
  'e1a610b5944475fcab566a33ebeae102b21014da',
  '20a60b63f8a1d4592817225ff73af7647d37cd8d',
  '264b53fd21de58b12c1dd5368c4f8b02d80b9562',
];

const SHELL_COMPONENT_KEY_SET = new Set(
  SHELL_COMPONENT_KEYS.map(normalizeShellComponentKey),
);

const SHELL_COMPONENT_SOURCE_FILES = [
  'Web _ Corp Components -- CorporateAppHeaderNew [D].json',
  'Web _ Corp Components -- CorporateAppHeaderMobile [M].json',
];

const SHELL_COMPONENT_SOURCE_FILE_SET = new Set(
  SHELL_COMPONENT_SOURCE_FILES.map(normalizeShellSourceFile),
);

export function isShellComponentAuditExcluded(item: AuditItem): boolean {
  const componentKeys = [
    item.componentKey,
    item.reference?.key,
    item.resolvedReferenceVariantKey,
  ];

  if (componentKeys.some(isShellComponentKeyExcluded)) {
    return true;
  }

  return (
    componentKeys.some(hasComponentKey) &&
    isShellComponentSourceFileExcluded(item.reference?.sourceFile)
  );
}

export function isShellDetachedEntryExcluded(item: DetachedEntry): boolean {
  if (isShellComponentKeyExcluded(item.componentKey)) {
    return true;
  }

  return (
    hasComponentKey(item.componentKey) &&
    isShellComponentSourceFileExcluded(item.sourceFile)
  );
}

export function isShellComponentKeyExcluded(key: string | null | undefined): boolean {
  return SHELL_COMPONENT_KEY_SET.has(normalizeShellComponentKey(key));
}

export function isShellComponentSourceFileExcluded(
  sourceFile: string | null | undefined,
): boolean {
  return SHELL_COMPONENT_SOURCE_FILE_SET.has(normalizeShellSourceFile(sourceFile));
}

export function getShellComponentAuditReason(item: AuditItem): string {
  const componentName =
    item.reference?.displayName ?? item.reference?.name ?? item.name;
  return `component ${componentName} is excluded by Apollo shell settings`;
}

function normalizeShellComponentKey(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeShellSourceFile(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

function hasComponentKey(value: string | null | undefined): boolean {
  return normalizeShellComponentKey(value).length > 0;
}
