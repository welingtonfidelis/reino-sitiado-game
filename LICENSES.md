# Licenças da arte

Toda a arte 3D é do **KayKit**, de Kay Lousberg (https://kaylousberg.com), sob **CC0 1.0**
(domínio público). Os arquivos vêm da coleção local "The Complete KayKit Collection v6.1",
copiados por `npm run art` conforme `tools/art-manifest.ts`.

| Pack | Arquivos usados |
| --- | --- |
| KayKit Medieval Hexagon Pack 1.0.1 | hex_grass; castelo, casas A e B, quartel, campo de tiro, serraria, mina, torre de vigia (a torre dos arqueiros), base de torre, moinho; plantação, andaime, ruína, muralha reta e com portão; árvores, montanhas, morro, pedras; bandeira; flecha; textura hexagons_medieval.png |
| KayKit Adventurers 2.0 | Knight, Ranger; sword_1handed, shield_round_color, bow_withString e as texturas knight e ranger |
| KayKit Skeletons 1.1 | Skeleton_Minion, Skeleton_Blade, skeleton_texture_A |
| KayKit Mystery Monthly 4 | Werewolf_Wolf, OrcRaider, Orc_Axe; Paladin_with_Helmet, paladin_hammer, paladin_shield e a textura (o cavaleiro) |
| KayKit Mystery Monthly 6 | Farmer_A, Farmer_B, OrcBrute; Cleric, Cleric_Mace e a textura |
| KayKit Adventurers 2.0 (Etapa 5) | Mage, Engineer, staff e mage_texture |
| KayKit Forest Nature Pack 1.0 (Etapa 8) | Rock_1_A a Rock_4_A (Color1) e forest_texture |
| KayKit Skeletons 1.1 (Etapa 6) | Necromancer, Skeleton_Golem, Skeleton_Staff |
| KayKit Mystery Monthly 5 (Etapa 6) | Witch, FrostGolem |
| KayKit Mystery Monthly 6 (Etapa 6) | Monstrosity (o troll) |
| KayKit Medieval Hexagon Pack (Etapa 5) | torre B, igreja, estábulo, ferreiro, oficina |
| KayKit Medieval Hexagon Pack (Etapa 9) | torre com catapulta e a pedra da catapulta |
| KayKit RPG Tools Bits 1.0 (Etapa 10) | axe, pickaxe, shovel, hammer e tools_bits_texture (ferramentas dos trabalhadores e martelo do engenheiro) |
| KayKit Resource Bits 1.0 | Iron_Nuggets; Stone_Bricks_Stack_Large e Medium, Stone_Chunks_Large e Small (pedreira); textura do pack |
| KayKit Medieval Hexagon Pack (pedreira) | barraca, resource_stone, crate_open |
| KayKit Medieval Hexagon Pack (vila) | poço, taverna, mercado, barril, caixa pequena, balde com água |
| KayKit Resource Bits (Etapa 17) | Wood_Log_A e Wood_Log_B (toras onde a floresta acabou) |
| KayKit Adventurers 2.0 (Etapa 14) | Barbarian, Rogue_Hooded, Druid; axe_2handed, crossbow_2handed, druid_staff e as texturas barbarian, rogue e druid |
| KayKit Mystery Monthly 5 (Etapa 14) | BlackKnight, BlackKnight_Sword_Large, BlackKnight_Shield_Large (a versão do rig grande, desde 2026-11-08) e a textura |
| Evolução visual (Etapa 19) | building_castle_yellow e banner_blue_full (Medieval Hexagon Pack); Paladin, sem elmo (Mystery Monthly 4); knight_texture_alt_A (Adventurers 2.0) |
| Revisão das armas (2026-11-08) | Orc_Axe_Large e orcbrute_texture_A (Mystery Monthly 6, orc bruto); Skeleton_Golem_Axe_Large (Skeletons 1.1); orc_texture_A (Mystery Monthly 4, a pele do orc saqueador) |
| Ícone (2026-11-09) | building_castle_yellow e banner_blue_full (Medieval Hexagon Pack), fotografados para `public/icons/`; a ilha, o fundo e o hexágono são do próprio projeto |
| Inimigos novos (2026-11-09) | Skeleton_Warrior, Skeleton_Axe, Skeleton_Shield_Small_A (Skeletons 1.1); Vampire, Vampire_Sword e vampire_texture (Mystery Monthly 5); Hoarder e 4GTN_Forgotten (Mystery Monthly 6) |
| Elfos e o Sábio (2026-11-09) | Helper_A, Helper_B, Candycane e helpers_texture (Mystery Monthly 5, Helpers); `public/ui/sabio.png`, retrato fotografado do Lorekeeper (Mystery Monthly 6) |
| Tropas novas (2026-11-09) | building_tent_blue, building_tower_cannon_blue e o elmo de chifres `units/neutral/helmet` (Medieval Hexagon Pack); spear_A e weapons_bits_texture (Fantasy Weapons Bits 1.0); shotgun e engineer_texture (Adventurers 2.0) |
| Fosso de piche (2026-11-09) | Cauldron e witch_texture_A (Mystery Monthly 5, Witch); torch_lit e dungeon_texture (Dungeon Pack 1.1). A poça e as estacas são feitas no próprio projeto |
| KayKit Character Animations 1.1 | Rig_Medium (General, MovementBasic, CombatMelee, CombatRanged, Tools, Simulation) e Rig_Large (General, MovementBasic, CombatMelee). Da Simulation (Etapa 16): Cheering, Waving, Sit_Floor_Idle e Push_Ups |

## pixelfx (Patch e Hugo Duprez) — MIT

Os efeitos (Etapas 3, 5 e 6) estão em `public/assets/fx/*.png`: quadros gerados por `tools/bake-fx.ts` a partir
do pixelfx, https://github.com/patch-gg/pixelfx (commit a84159688af3ca37a4be05a0d422b94451b2e24e).

| Folha | Efeito do pixelfx |
| --- | --- |
| faisca | impacts/hit-spark (adapta o impact do Sprite Fusion, Hugo Duprez, MIT) |
| pancada | impacts/blunt-hit |
| espada | melee/sword-slash |
| garra | melee/claw-swipe |
| poof | spawn/poof |
| explosao | explosions/dirt-explosion |
| fogo | status/burning |
| portal | arcane/portal |
| nivel | ui/level-up (texto trocado para "NOVO NIVEL!") |
| moedas | ui/coin-collect |
| mana | arcane/mana-burst (impacto do feitiço do mago) |
| cura | holy/heal (clérigo), sem o corpo do boneco de demonstração (a função `recolor` do efeito fica desligada ao gerar a folha) |
| golpe | melee/heavy-cleave (cavaleiro) |
| morcego | critters/bat (o morcego gigante voando) |
| alma | spawn/soul-rise (esqueleto levantado pelo necromante) |
| bloom | nature/healing-bloom (cura da bruxa e da druida) |
| giro | melee/spin-slash (giro do Bárbaro) |
| chuva | arcane/star-fall (chuva de virotes da Atiradora) |
| raizes | nature/root-snare (raízes da Druida) |
| pisao | impacts/heavy-landing (pisão do Cavaleiro Negro) |
| bencao | holy/blessing (herói chegando ou voltando) |
| fogos | explosions/firework-burst (festa da vitória, Etapa 16) |
| confete | ui/confetti (festa da vitória) |
| borboleta | critters/butterfly (borboletas nas plantações) |
| passaro | critters/bird (pássaros cruzando o céu) |
| respingo | water/splash (peixe pulando no lago) |

Mudanças nossas: ritmo de quadros menor nos efeitos longos e o texto do "subir de nível". O código
do pixelfx não vai no jogo nem no repositório.

```
MIT License

Copyright (c) 2026 Patch
Copyright (c) 2026 Hugo Duprez

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Os cristais dos veios azuis, a plantação, as texturas de grama e solo, a água, o fosso de piche, as estacas, a paliçada, a tora que o aldeão leva no ombro, a fumaça dos prédios feridos e as luzes da noite são feitos no próprio projeto. Os retratos do Livro do Sábio (`public/ui/bestiario/`) são fotos dos personagens do KayKit tiradas no próprio jogo; o do morcego é um quadro do sprite do pixelfx.

O código, a interface e as regras são do próprio projeto. A interface usa os tokens e
componentes do design system do Vigília, outro projeto do mesmo autor.
