# Reino Sitiado

Tower defense sem fim em 2.5D isométrico. O jogador ergue um reino em volta do castelo: planta, corta madeira, quebra pedra, minera ferro, constrói casas para ter quem trabalhe, treina soldados e arqueiros e fecha tudo com muralhas e portões. As hordas saem de fendas no norte, a cada onda maiores, mais fortes e mais variadas. A partida acaba quando o castelo cai.

Nome provisório. Proposta visual (canvas, design system Vigília): https://claude.ai/artifact/E2kdbKNuRkqvb9bmsePrsy

Repositório: https://github.com/welingtonfidelis/reino-sitiado-game (criado pelo usuário em 2026-11-06). As etapas 1 a 6 estão na `main` (commit 7ff4b86). Commit e push só quando o usuário pedir.

## 1. Decisões

| Assunto | Decisão | Por quê |
| --- | --- | --- |
| Grade | Hexágonos "pontudos" do KayKit Medieval Hexagon Pack | O pack traz castelo, casas, quartel, campo de tiro, mina, serraria, torres e muralhas já feitos para hexágono. |
| Chão | Contínuo, sem divisa de hexágono; as linhas da grade só aparecem ao construir ou mover | Pedido do usuário (2026-11-06): manter a grade na lógica, escondida no visual. |
| Tecnologia | Web: Vite, TypeScript, Three.js e Preact | Mesma base do Outpost 7. Abre no iPhone pela rede, sem instalar. |
| Câmera | Ortográfica, ângulo fixo (yaw 30°, pitch 47°) | É o "2.5D": profundidade dos modelos sem perspectiva. |
| Escopo da v1 | Fatia enxuta (seção 3) | Jogável cedo; o resto da proposta entra por etapas. |
| HUD | Enxuto: pílula de recursos, onda e velocidade, um botão Construir | Pedido do usuário. |
| Recrutar | Só pelo menu do prédio (tocar no quartel) | Pedido do usuário: nada de botão de recrutar na tela. |
| Trabalhadores | Chegam sozinhos; nunca são comprados | Pedido do usuário, com limite para não facilitar (seção 4). |
| Visual da interface | Tokens e componentes do Vigília (`src/ui/vigilia*.css`) | Escolha do usuário para a proposta. |
| Efeitos | Sempre que der, usar os efeitos do pixelfx (https://patch-gg.github.io/pixelfx/, licença MIT) | Pedido do usuário (2026-11-06). O Outpost 7 já usa e tem a ferramenta que converte (`tools/bake-fx.ts` lá). |
| Ponto de encontro | Cada prédio que treina tropas pode marcar onde elas ficam esperando ao sair | Pedido do usuário (2026-11-06). |
| Ordens | Escolher tropas (iguais ou não) e marcar um ponto no mapa para onde vão | Pedido do usuário (2026-11-06). |
| Teto das tropas | Por enquanto, tropas não contam no teto de moradores | Pedido do usuário (2026-11-06): elas morrem com frequência ao longo do jogo. |

## 2. Como rodar

```bash
npm install
npm run art     # copia a arte da coleção KayKit local (precisa de git lfs pull nela)
npm run dev     # http://localhost:5173
npm test
npm run build
```

Na pasta de projetos, o `.claude/launch.json` tem `reino` (porta 5230) e `reino-rede` (5232, aberto para o iPhone na rede: http://192.168.0.16:5232/).

Parâmetros de teste na URL:
- `?jogar` pula a tela de começo;
- `?semente=N` fixa o mapa;
- `?onda=N` começa perto da onda N com +600 de cada recurso;
- `?rapido` faz a primeira onda chegar em 8 s;
- `?semsombra` desliga as sombras.

No console: `game`, `view`, `cam` e `snap('nome')` (salva `reports/snap-nome.png`).

## 3. O que a v1 tem

- **Mapa:** hexagonal de raio 13, sorteado pela semente. Tem florestas, rochas, veios de minério e três fendas na borda norte; a 1ª abre na onda 1, a 2ª na 10 e a 3ª na 20.
- **Começo:** castelo, duas casas, uma fazenda e quatro trabalhadores.
- **Economia:** comida, madeira, pedra, ferro e ouro. O ouro vem das ondas e de chamar a onda antes da hora.
- **Prédios:**

  | Grupo | Prédios |
  | --- | --- |
  | Moradia | casa |
  | Economia | fazenda; serraria (ao lado de floresta); pedreira (ao lado de rocha); mina (em cima do veio) |
  | Defesa | muralha; portão (em cima de uma muralha pronta); torre de arqueiros |
  | Militar | quartel; campo de tiro |

- **Menu do prédio:**
  - vida, obra, trabalhadores, fila e guarnição;
  - recrutar (quartel e campo);
  - melhorar (castelo);
  - mover, só entre as ondas;
  - consertar, pagando proporcional ao estrago;
  - destruir, com confirmação e metade do custo de volta.
- **Tropas:**
  - soldado: corpo a corpo, procura o monstro mais perto que dá para alcançar a pé;
  - arqueiro: sobe sozinho para a torre com vaga, senão guarda o castelo atirando do chão.
- **Horda:**

  | Monstro | A partir da onda | Detalhe |
  | --- | --- | --- |
  | Esqueleto | 1 | |
  | Lobisomem | 2 | rápido |
  | Orc saqueador | 4 | 3× de dano em prédios |
  | Orc bruto | 8 | tanque |

- **Ondas:** sem fim, com +8% de vida por onda e +3 monstros por onda. O intervalo começa em 90 s e cai 3 s por onda até 45 s; a primeira chega em 2 min.
- **Defesa do castelo:** atira sozinho (alcance 8). Se ele cair, a partida acaba.

## 4. Regras de trabalhadores e moradia (aprovadas)

- Com vaga, chega 1 trabalhador a cada 20 s, perto do castelo.
- **Vagas:** castelo 4, cada casa mais 4.
- **Teto do castelo:** 24, 40, 60 e 80 moradores por nível. Casa além do teto fica vazia.
- **Comida:** cada morador come 1 por minuto. Com o celeiro vazio, ninguém chega e o trabalho rende metade.
- **Casa mais cara:** cada casa nova custa 10% a mais de madeira que a anterior.
- **Recrutar tira um trabalhador da vila:** primeiro um sem emprego, senão um de algum prédio.
- **Tropas sem teto (Etapa 2):** só trabalhadores contam nas vagas e no teto do castelo. Quem vira tropa libera a vaga, e outro trabalhador chega depois. Tropas continuam comendo.
- **Empregos:** os trabalhadores vão sozinhos para o prédio mais perto com vaga e que dá para alcançar a pé.

Todos os números estão em `src/sim/config.ts`. São valores iniciais para testar.

## 5. Ponto de encontro e ordens (Etapa 2)

- **Ponto de encontro:** no menu do quartel e do campo de tiro, o botão Encontro pede um toque no mapa.
  - Quem sai treinado de lá vai para esse ponto e espera em roda.
  - Quem já saiu fica onde está: mudar o ponto só vale para os próximos (pedido do usuário, 2026-11-06).
  - O ponto aparece como uma bandeira quando o prédio está selecionado.
- **Arqueiros:** sem ponto de encontro, sobem sozinhos para torres com vaga. Com ponto ou com ordem, ficam onde foram mandados e atiram do chão.
- **Escolher tropas:**
  - tocar numa tropa escolhe ela;
  - com tropas escolhidas, tocar em outra põe ou tira da escolha;
  - o botão Selecionar faz o próximo arrasto desenhar uma caixa (no mouse, Shift + arrastar também serve);
  - trabalhadores não entram na escolha.
- **Mandar:** com tropas escolhidas, tocar no mapa manda todas para lá, em roda em volta do ponto.
  - Lá elas seguram a posição: só saem para lutar com monstros a até 5 m do ponto (sem ordem, os soldados vão até 11 m).
  - Se ninguém alcança o ponto a pé (muralha sem portão), aparece o aviso.
  - Mandar um arqueiro que está numa torre tira ele de lá.

- **Recolher no castelo:** o menu do castelo tem o botão "Recolher os trabalhadores no castelo" (pedido do usuário, 2026-11-06).
  - Todos os trabalhadores vão para o castelo e somem lá dentro; a horda não os alcança.
  - Quem chega enquanto isso também entra.
  - Ninguém trabalha, então a produção para; a comida continua sendo comida.
  - "Liberar os trabalhadores" põe todos na porta do castelo e cada um volta ao seu emprego.
  - Recrutar ainda funciona: o recruta sai de dentro do castelo direto para o prédio.

## 6. Efeitos do pixelfx (Etapa 3)

Regra do usuário: usar os efeitos do pixelfx sempre que der (https://patch-gg.github.io/pixelfx/, MIT).

- **Como entram:** com o OK do usuário, baixei só 33 arquivos do repositório (~300 KB, commit a841596) para uma pasta temporária, fora do projeto. Li o código antes de rodar: só imports locais, sem rede nem disco.
  - Desde a Etapa 5 os efeitos saem da cópia local que o usuário clonou em `../pixelfx` (mesmo commit), liberada para uso.
  - `tools/bake-fx.ts` (`node tools/bake-fx.ts ../pixelfx`) roda cada efeito no node e grava uma folha de quadros por efeito em `public/assets/fx/`, com as medidas em `src/render/fxSheets.ts` (gerado).
  - Os efeitos longos saem a 12–20 quadros por segundo para pesar menos. Ao todo são 6 Mpx, cerca de 23 MB na GPU; a explosão sozinha tem 9 MB.
- **Na tela (`src/render/fx.ts`):** cada efeito é um quadrado virado para a câmera, preso pela origem do efeito (o chão onde ele acontece).
  - Por tipo de efeito: uma textura e uma malha instanciada. Nada é alocado por efeito tocado.
  - Pixel nítido (filtro "nearest") e um pouco à frente na profundidade, para não entrar no corpo de quem apanha.
  - Anda no tempo do jogo: congela na pausa.
  - Tamanho: de 1 a 3 cm por pixel do efeito, nunca menor que meio pixel de tela.
- **Onde aparece:**

| Efeito | Quando |
| --- | --- |
| Faísca de impacto | flecha chegando no alvo (torre, castelo, arqueiro) |
| Corte de espada | golpe de soldado |
| Garra | monstro atacando gente |
| Pancada | monstro batendo em prédio ou muralha |
| Poof | monstro morrendo |
| Terra explodindo | prédio ou muralha destruídos (menor na muralha) |
| Queimando | em laço, nos prédios com menos da metade da vida, até consertar |
| Portal | em laço, em cada fenda aberta |
| Novo nível | castelo melhorado |
| Moedas | ouro no fim da onda, em cima do castelo |

- As flechas continuam 3D (modelo do pack); só o impacto é do pixelfx.

## 7. Fim de onda e bênçãos (Etapa 4)

- **Relatório:** abre a cada onda resistida e o jogo espera. Mostra o que aconteceu desde o relatório anterior:
  - monstros abatidos;
  - perdas (tropas e trabalhadores);
  - estragos (trechos de muralha e prédios derrubados);
  - colheita; madeira, pedra e ferro produzidos;
  - o saque de ouro.
- **Caídos:** cada pessoa tem nome (masculino ou feminino) desde que chega. Quem cai aparece com um epitáfio curto ("Joana, trabalhadora. Estava no trabalho quando a horda chegou."). Até 6 nomes, depois "e mais N".
- **Bênção a cada 4 ondas:** três sorteadas entre as que ainda não foram escolhidas; é preciso escolher uma para seguir. Valem para o resto da partida e aparecem no menu do castelo.

| Bênção | Efeito |
| --- | --- |
| Flechas em brasa | +40% de dano em toda flecha |
| Celeiros fundos | +25% de comida |
| Pedra benta | muralhas e portões recuperam um terço da vida no fim de cada onda |
| Machados afiados | +30% de madeira |
| Picaretas novas | +30% de pedra e ferro |
| Escudos de ferro | +30% de vida nos soldados, inclusive os que já existem |
| Muralhas grossas | +40% de vida em muralhas e portões, inclusive os de pé |
| Castelo vigilante | castelo com o dobro de dano e +2 m de alcance |
| Estrada aberta | trabalhadores chegam a cada 14 s em vez de 20 s |
| Ouro da coroa | +30% de ouro por onda |

- **Próxima onda:** quantos de cada monstro vêm, o aviso quando um monstro novo estreia e quando uma fenda nova abre.
- **Botões:**
  - "Reparar tudo", pela soma dos consertos;
  - "Chamar agora", com o ouro pelo tempo que sobra;
  - "Continuar", que mostra quanto falta para a onda.
- O saque e as bênçãos ficam em `src/sim/blessings.ts`. O aviso solto de "onda resistida" saiu: o relatório faz esse papel.

## 8. Tropas e prédios novos (Etapa 5)

- **Cristal:** recurso novo.
  - Parte dos veios é azul (cristal) e parte é de ferro. Uma mina em veio azul rende 1,5 de cristal por trabalhador por minuto.
  - Os cristais do veio são feitos no projeto, porque o KayKit local não tem cristal.
  - O mago e a torre do mago gastam cristal.
- **Prédios** (todos no grupo Militar):

| Prédio | Custo | Exige | Faz |
| --- | --- | --- | --- |
| Oficina | 40 madeira · 20 pedra | — | treina engenheiros |
| Capela | 50 pedra · 20 ouro | — | treina clérigos; quem está ferido a até 3 m se cura 2 de vida por segundo |
| Forja | 40 pedra · 30 ferro | — | melhorias (abaixo) |
| Torre do mago | 60 pedra · 10 cristal | castelo nível 2 | treina magos |
| Estábulo | 70 madeira · 20 ferro | castelo nível 2 | treina cavaleiros (a proposta pedia nível 3; baixei para 2 para dar tempo de usar) |

- **Tropas:**

| Tropa | Custo | Como age |
| --- | --- | --- |
| Mago | 30 comida · 4 cristal | feitiço a 6,5 m que acerta todos num raio de 1,3 m; cada feitiço gasta 0,25 de cristal; sem cristal, não lança |
| Clérigo | 25 comida · 10 ouro | cura 12 de vida em quem está mais ferido por perto; vai até feridos perto do posto |
| Cavaleiro | 40 comida · 25 ferro · 10 ouro | corpo a corpo rápido e forte; sai atrás de monstros a até 15 m do posto |
| Engenheiro | 15 comida · 10 pedra | conserta o que está estragado a até 18 m do posto (muralha primeiro), 12 de vida por segundo por 1 pedra a cada 25, até no meio da onda; não luta |

- **Forja:** três linhas de melhoria, até o nível 3. Custos: 30 ferro e 20 ouro, depois 60 e 50, depois 100 e 100. Valem para todos, inclusive quem já existe.
  - armas: +20% de dano corpo a corpo e dos magos;
  - armaduras: +20% de vida das tropas;
  - pontas de ferro: +15% nas flechas.
- **Arte e efeitos:**

| Tropa | Modelo | Arma | Efeito do pixelfx |
| --- | --- | --- | --- |
| Mago | Mage | cajado | esfera que voa e explode em "mana" |
| Clérigo | Cleric | maça | "cura" |
| Cavaleiro | Paladino do KayKit | martelo e escudo | "golpe" |
| Engenheiro | Engineer | martelo do pack medieval | faíscas ao consertar |

- **Prédios:** torre B, igreja, estábulo, ferreiro e oficina do pack medieval.

## 9. Monstros novos e chefes (Etapa 6)

| Monstro | Desde | Modelo | Como age |
| --- | --- | --- | --- |
| Morcego gigante | onda 8 (12% da onda) | sprite "bat" do pixelfx | voa a 1,8 m por cima das muralhas, direto para as casas (depois os outros prédios, o castelo por último); ataca gente que estiver fora; só flecha, magia e castelo o alcançam |
| Bruxa | onda 9 (1, até 4) | Witch | lenta, cura 10 de vida nos monstros a até 3 m a cada 2,5 s (efeito "healing bloom"). É a xamã da proposta |
| Troll | onda 12 | Monstrosity (rig grande) | 180 de vida, recupera 3% por segundo se não for queimado (magia ou flecha com a bênção Flechas em brasa) nos últimos 3 s |
| Necromante | onda 16 | Necromancer, com cajado | levanta um esqueleto ao lado a cada 6 s, até 5 vivos (efeito "soul rise") |
| Golem de gelo (chefe) | onda 15, 45, 75… | FrostGolem | 2500 de vida (cresce com a onda), golpe de 60, derruba muralha; flecha não fere |
| Golem de ossos (chefe) | onda 30, 60… | Skeleton_Golem | 3500 de vida, golpe de 70; magia não fere |

- **Quem mira em quê:** soldados e cavaleiros não alcançam quem voa. Arqueiros, torres e castelo não miram no golem de gelo; magos não miram no de ossos.
- **Chefe:** um aviso quando sai da fenda e uma barra de vida no topo da tela enquanto vive. O relatório avisa na onda anterior.
- **Nomes:** os da proposta foram adaptados aos modelos do KayKit local (bruxa no lugar do xamã goblin; golem de gelo e golem de ossos no lugar do golem de pedra e da serpe de cinzas, que não têm modelo).
- **Peso dos efeitos:** com as folhas novas, os efeitos somam cerca de 34 MB na GPU. Vale medir no iPhone.

## 10. Arquitetura

- `src/sim/`: simulação pura, 20 passos por segundo, sem DOM.
  - `hex.ts`: coordenadas axiais e conversão para o mundo; um hexágono tem 2 m de lado a lado.
  - `world.ts`: estado e geração do mapa.
  - `path.ts`: campo de fluxo da horda e caminho das pessoas.
  - `step.ts`: obras, economia, chegadas, recrutas, ondas, horda, tropas e defesas.
  - `commands.ts`: ordens do jogador, cada uma com o motivo de não poder.
- **Campo de fluxo:** Dijkstra a partir do castelo. Prédios e muralhas custam mais para atravessar (`breakCost`). Com o reino todo cercado, o caminho mais barato passa por uma muralha, e o monstro para e bate nela.
- **Gente do reino:** anda por busca em largura. Rocha e prédios bloqueiam; portão e fazenda deixam passar. Os soldados só lutam onde alcançam a pé (`reach`).
- `src/render/`:
  - `assets.ts`: carrega a arte; modelos parados viram geometria única para instanciar.
  - `ground.ts`: chão contínuo. Seis triângulos por hexágono, sem fresta; a cor de cada vértice mistura os terrenos vizinhos com ruído, então não se vê ladrilho. A borda do mapa ganha uma encosta de terra, e as linhas da grade são uma malha à parte.
  - `world3d.ts`: natureza, prédios e muralhas instanciados (refeitos quando `world.ver` muda); personagens com esqueleto; flechas e barras de vida instanciadas.
  - `camera.ts`: câmera isométrica com arrastar, pinça, roda e toque.
- **Muralha:** cada trecho desenha meio muro até cada vizinho que também é muralha e um poste nas curvas e pontas. O portão segue a linha dos dois vizinhos opostos.
- `src/game/game.ts`: ritmo (pausa, 1×, 2×, 3×), modo de construir ou mover, seleção e avisos. No toque, o primeiro toque mostra o fantasma e o segundo confirma; no mouse, o clique confirma.
- `src/ui/App.tsx`: HUD, bandeja Construir, menu do prédio, avisos e telas de começo e fim.

## 11. Etapas

| Etapa | O que | Situação |
| --- | --- | --- |
| 1 | Fatia jogável: tudo da seção 3 | Pronta em 2026-11-06. Testada no navegador do Mac (computador e tela de celular); falta jogar no iPhone. |
| 2 | Tropas sem teto, ponto de encontro dos prédios, escolher tropas e mandar para um ponto (seção 5) | Pronta em 2026-11-06. Testada no navegador do Mac. |
| 3 | Efeitos do pixelfx (seção 6) | Pronta em 2026-11-06. Vista no navegador do Mac; falta jogar no iPhone. |
| 4 | Relatório de fim de onda e bênçãos a cada 4 ondas (seção 7) | Pronta em 2026-11-06. Vista no navegador do Mac; falta jogar no iPhone. |
| 5 | Cristal; mago, clérigo, cavaleiro e engenheiro; torre do mago, capela, estábulo, forja e oficina (seção 8) | Pronta em 2026-11-06. Vista no navegador do Mac; falta jogar no iPhone. |
| 6 | Morcego, bruxa, troll, necromante e dois chefes (seção 9) | Pronta em 2026-11-06. Vista no navegador do Mac; falta jogar no iPhone. |
| 7 | Salvar a partida, som, ajustes de equilíbrio com robô de teste | A fazer |
| 8 | Texturas próprias de grama, solo e água para o chão, para disfarçar ainda mais a grade (pedido do usuário, 2026-11-06). A plantação e as montanhas do pack ainda têm base hexagonal; rever junto. | A fazer |

## 12. Arte e licenças

Tudo do KayKit (Kay Lousberg, CC0), copiado da coleção local por `npm run art` (lista em `tools/art-manifest.ts`). Detalhes em `LICENSES.md`.

| Pack | O que vem dele |
| --- | --- |
| Medieval Hexagon Pack | ladrilho, prédios, muralhas, natureza, flecha |
| Adventurers 2.0 | cavaleiro, arqueira, espada, escudo, arco |
| Skeletons | esqueleto, lâmina |
| Mystery Monthly | fazendeiros, lobisomem, orc saqueador e machado, orc bruto |
| Resource Bits | minério |
| Character Animations | todas as animações |

Os efeitos vêm do pixelfx (MIT); detalhes na seção 6 e em `LICENSES.md`.
