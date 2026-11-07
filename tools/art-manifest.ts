/**
 * O que vem da coleção KayKit local (CC0) para public/assets/kaykit. Só estes arquivos são
 * copiados (`npm run art`); a coleção fica fora do projeto. Os .bin e as texturas vêm do
 * Git LFS da coleção (git lfs pull antes, senão o import recusa o ponteiro).
 */
export const KAYKIT_ROOT = '../kaykit-complete-v6-1-assets';

const MH = 'KayKit Medieval Hexagon Pack 1.0.1/Assets/gltf';
const ADV = 'KayKit Adventurers 2.0';
const SK = 'KayKit Skeletons 1.1';
const RB = 'KayKit Resource Bits 1.0/Assets/gltf';
const CA = 'KayKit Character Animations 1.1/Animations/gltf';
const MM4 = 'KayKit Mystery Monthly Series 4 (1.1)';
const MM5 = 'KayKit Mystery Monthly Series 5 (1.1)';
const FN = 'KayKit Forest Nature Pack 1.0/Assets/gltf/Color1';
const MM6 = 'KayKit Mystery Monthly Series 6 (1.1)';
const TB = 'KayKit RPG Tools Bits 1.0/Assets/gltf';

/** Modelos do pack medieval: [pasta dentro de gltf/, nome]. Todos vão para medieval/. */
export const MEDIEVAL: [string, string][] = [
  ['tiles/base', 'hex_grass'],
  ...['castle', 'home_A', 'home_B', 'barracks', 'archeryrange', 'lumbermill', 'mine', 'watchtower', 'tower_base', 'windmill', 'tower_B', 'church', 'stables', 'blacksmith', 'workshop', 'tower_catapult'].map(
    (n) => ['buildings/blue', `building_${n}_blue`] as [string, string],
  ),
  ...['building_grain', 'building_scaffolding', 'building_destroyed', 'wall_straight', 'wall_straight_gate'].map(
    (n) => ['buildings/neutral', n] as [string, string],
  ),
  ...[
    'trees_A_large',
    'trees_A_medium',
    'trees_B_large',
    'trees_B_medium',
    'tree_single_A',
    'tree_single_B',
    'mountain_A',
    'mountain_B',
    'mountain_C',
    'hill_single_A',
    'hill_single_C',
    'rock_single_A',
    'rock_single_C',
    'rock_single_E',
  ].map((n) => ['decoration/nature', n] as [string, string]),
  ['decoration/props', 'flag_blue'],
  // Fazenda em teste: enfeites em volta do celeiro.
  ['decoration/props', 'haybale'],
  ['decoration/props', 'sack'],
  ['decoration/props', 'wheelbarrow'],
  // Pedreira a céu aberto (barraca, pedra cortada e caixote): não é mais a mina pintada de amarelo.
  ['decoration/props', 'tent'],
  ['decoration/props', 'resource_stone'],
  ['decoration/props', 'crate_open'],
  // Vila: poço da praça, taverna e mercado do bairro, barril, caixa e balde nos quintais.
  ['buildings/blue', 'building_well_blue'],
  ['buildings/blue', 'building_tavern_blue'],
  ['buildings/blue', 'building_market_blue'],
  ['decoration/props', 'barrel'],
  ['decoration/props', 'crate_A_small'],
  ['decoration/props', 'bucket_water'],
  ['units/neutral', 'projectile_arrow'],
  ['buildings/neutral', 'projectile_catapult'],
];

/** [origem relativa à coleção, destino relativo a public/assets/kaykit] */
export const ART: [string, string][] = [
  ...MEDIEVAL.flatMap(([dir, n]) => [
    [`${MH}/${dir}/${n}.gltf`, `medieval/${n}.gltf`],
    [`${MH}/${dir}/${n}.bin`, `medieval/${n}.bin`],
  ] as [string, string][]),
  [`${MH}/tiles/base/hexagons_medieval.png`, 'medieval/hexagons_medieval.png'],
  // Personagens (o .glb já traz a textura).
  [`${ADV}/Characters/gltf/Knight.glb`, 'chars/Knight.glb'],
  [`${ADV}/Characters/gltf/Ranger.glb`, 'chars/Ranger.glb'],
  [`${MM6}/12 - June 2026 - Farmers/characters/Farmer_A.glb`, 'chars/Farmer_A.glb'],
  [`${MM6}/12 - June 2026 - Farmers/characters/Farmer_B.glb`, 'chars/Farmer_B.glb'],
  [`${SK}/characters/gltf/Skeleton_Minion.glb`, 'chars/Skeleton_Minion.glb'],
  [`${MM4}/4 - October 2023 - Werewolf/characters/gltf/Werewolf_Wolf.glb`, 'chars/Werewolf_Wolf.glb'],
  [`${MM4}/1 - July 2023 - Orc Raider/character/OrcRaider.glb`, 'chars/OrcRaider.glb'],
  [`${MM6}/2 - August 2025 - Orc Brute/characters/OrcBrute.glb`, 'chars/OrcBrute.glb'],
  // Etapa 5: mago, clérigo, cavaleiro (o Paladino do KayKit) e engenheiro.
  [`${ADV}/Characters/gltf/Mage.glb`, 'chars/Mage.glb'],
  [`${ADV}/Characters/gltf/Engineer.glb`, 'chars/Engineer.glb'],
  [`${MM6}/3 - September 2025 - Cleric/characters/Cleric.glb`, 'chars/Cleric.glb'],
  [`${MM4}/10 - April 2024 - Paladin/characters/gltf/Paladin_with_Helmet.glb`, 'chars/Paladin.glb'],
  // Etapa 6: bruxa, troll (a Monstruosidade), necromante e os dois golens chefes.
  [`${MM5}/5 - November 2024 - Witch/characters/Witch.glb`, 'chars/Witch.glb'],
  [`${MM6}/4 - October 2025 - Monstrosity/characters/Monstrosity.glb`, 'chars/Monstrosity.glb'],
  [`${SK}/characters/gltf/Necromancer.glb`, 'chars/Necromancer.glb'],
  [`${MM5}/7 - January 2025 - FrostGolem/characters/FrostGolem.glb`, 'chars/FrostGolem.glb'],
  [`${SK}/characters/gltf/Skeleton_Golem.glb`, 'chars/Skeleton_Golem.glb'],
  // Etapa 14: heróis (a atiradora é a ladina encapuzada, de besta).
  [`${ADV}/Characters/gltf/Barbarian.glb`, 'chars/Barbarian.glb'],
  [`${ADV}/Characters/gltf/Rogue_Hooded.glb`, 'chars/Rogue_Hooded.glb'],
  [`${ADV}/Characters/gltf/Druid.glb`, 'chars/Druid.glb'],
  [`${MM5}/3 - September 2024 - Black Knight/characters/BlackKnight.glb`, 'chars/BlackKnight.glb'],
  // Armas.
  ...['sword_1handed', 'shield_round_color', 'bow_withString'].flatMap((n) => [
    [`${ADV}/Assets/gltf/${n}.gltf`, `weapons/${n}.gltf`],
    [`${ADV}/Assets/gltf/${n}.bin`, `weapons/${n}.bin`],
  ] as [string, string][]),
  [`${ADV}/Assets/gltf/knight_texture.png`, 'weapons/knight_texture.png'],
  [`${ADV}/Assets/gltf/staff.gltf`, 'weapons/staff.gltf'],
  [`${ADV}/Assets/gltf/staff.bin`, 'weapons/staff.bin'],
  [`${ADV}/Assets/gltf/mage_texture.png`, 'weapons/mage_texture.png'],
  [`${MM6}/3 - September 2025 - Cleric/assets/gltf/Cleric_Mace.gltf`, 'weapons/Cleric_Mace.gltf'],
  [`${MM6}/3 - September 2025 - Cleric/assets/gltf/Cleric_Mace.bin`, 'weapons/Cleric_Mace.bin'],
  [`${MM6}/3 - September 2025 - Cleric/assets/gltf/cleric_texture.png`, 'weapons/cleric_texture.png'],
  ...['paladin_hammer', 'paladin_shield'].flatMap((n) => [
    [`${MM4}/10 - April 2024 - Paladin/assets/gltf/${n}.gltf`, `weapons/${n}.gltf`],
    [`${MM4}/10 - April 2024 - Paladin/assets/gltf/${n}.bin`, `weapons/${n}.bin`],
  ] as [string, string][]),
  [`${MM4}/10 - April 2024 - Paladin/assets/gltf/paladin_texture_A.png`, 'weapons/paladin_texture_A.png'],
  [`${ADV}/Assets/gltf/ranger_texture.png`, 'weapons/ranger_texture.png'],
  [`${SK}/assets/gltf/Skeleton_Blade.gltf`, 'weapons/Skeleton_Blade.gltf'],
  [`${SK}/assets/gltf/Skeleton_Blade.bin`, 'weapons/Skeleton_Blade.bin'],
  [`${SK}/assets/gltf/Skeleton_Staff.gltf`, 'weapons/Skeleton_Staff.gltf'],
  [`${SK}/assets/gltf/Skeleton_Staff.bin`, 'weapons/Skeleton_Staff.bin'],
  [`${SK}/assets/gltf/skeleton_texture_A.png`, 'weapons/skeleton_texture_A.png'],
  [`${MM4}/1 - July 2023 - Orc Raider/assets/gltf/Orc_Axe.gltf.glb`, 'weapons/Orc_Axe.glb'],
  // Armas dos heróis (Etapa 14).
  ...['axe_2handed', 'druid_staff', 'crossbow_2handed'].flatMap((n) => [
    [`${ADV}/Assets/gltf/${n}.gltf`, `weapons/${n}.gltf`],
    [`${ADV}/Assets/gltf/${n}.bin`, `weapons/${n}.bin`],
  ] as [string, string][]),
  ...['barbarian_texture.png', 'druid_texture.png', 'rogue_texture.png'].map((n) => [`${ADV}/Assets/gltf/${n}`, `weapons/${n}`] as [string, string]),
  ...['BlackKnight_Sword', 'BlackKnight_Shield'].flatMap((n) => [
    [`${MM5}/3 - September 2024 - Black Knight/assets/gltf/${n}.gltf`, `weapons/${n}.gltf`],
    [`${MM5}/3 - September 2024 - Black Knight/assets/gltf/${n}.bin`, `weapons/${n}.bin`],
  ] as [string, string][]),
  [`${MM5}/3 - September 2024 - Black Knight/assets/gltf/blackknight_texture.png`, 'weapons/blackknight_texture.png'],
  // Ferramentas dos trabalhadores (RPG Tools Bits): machado na serraria, picareta na pedreira e na mina, pá na fazenda;
  // o martelo vai para o engenheiro (o do pack medieval ficava minúsculo na mão).
  ...['axe', 'pickaxe', 'shovel', 'hammer'].flatMap((n) => [
    [`${TB}/${n}.gltf`, `tools/${n}.gltf`],
    [`${TB}/${n}.bin`, `tools/${n}.bin`],
  ] as [string, string][]),
  [`${TB}/tools_bits_texture.png`, 'tools/tools_bits_texture.png'],
  // Etapa 8: rochas sem base hexagonal (Forest Nature Pack) no lugar das montanhas do pack medieval.
  ...[1, 2, 3, 4].flatMap((n) => [
    [`${FN}/Rock_${n}_A_Color1.gltf`, `forest/Rock_${n}_A_Color1.gltf`],
    [`${FN}/Rock_${n}_A_Color1.bin`, `forest/Rock_${n}_A_Color1.bin`],
  ] as [string, string][]),
  [`${FN}/forest_texture.png`, 'forest/forest_texture.png'],
  // Minério da mina; blocos e lascas de pedra da pedreira.
  ...['Iron_Nuggets', 'Stone_Bricks_Stack_Large', 'Stone_Bricks_Stack_Medium', 'Stone_Chunks_Large', 'Stone_Chunks_Small'].flatMap((n) => [
    [`${RB}/${n}.gltf`, `resource/${n}.gltf`],
    [`${RB}/${n}.bin`, `resource/${n}.bin`],
  ] as [string, string][]),
  [`${RB}/resource_bits_texture.png`, 'resource/resource_bits_texture.png'],
  // Animações (os personagens não trazem nenhuma).
  ...['General', 'MovementBasic', 'CombatMelee', 'CombatRanged', 'Tools', 'Simulation'].map(
    (n) => [`${CA}/Rig_Medium/Rig_Medium_${n}.glb`, `anims/Rig_Medium_${n}.glb`] as [string, string],
  ),
  ...['General', 'MovementBasic', 'CombatMelee'].map(
    (n) => [`${CA}/Rig_Large/Rig_Large_${n}.glb`, `anims/Rig_Large_${n}.glb`] as [string, string],
  ),
];
