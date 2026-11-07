# Reino Sitiado

Tower defense sem fim em 2.5D isométrico. O jogador ergue um reino em volta do castelo: planta, corta madeira, quebra pedra, minera ferro, constrói casas para ter quem trabalhe, treina soldados e arqueiros e fecha tudo com muralhas e portões. As hordas saem de fendas no norte, a cada onda maiores, mais fortes e mais variadas. A partida acaba quando o castelo cai.

Nome provisório. Proposta visual (canvas, design system Vigília): https://claude.ai/artifact/E2kdbKNuRkqvb9bmsePrsy

Repositório: https://github.com/welingtonfidelis/reino-sitiado-game (criado pelo usuário em 2026-11-06). As etapas 1 a 12 estão na `main`; cada etapa tem o seu commit ("Etapa N: …" no `git log`). O jogo é publicado no GitHub Pages a cada push na `main`: https://welingtonfidelis.github.io/reino-sitiado-game/ (`.github/workflows/pages.yml`; a build usa `--base=/reino-sitiado-game/`). Commit e push só quando o usuário pedir.

## 1. Decisões

| Assunto | Decisão | Por quê |
| --- | --- | --- |
| Grade | Hexágonos "pontudos" do KayKit Medieval Hexagon Pack | O pack traz castelo, casas, quartel, campo de tiro, mina, serraria, torres e muralhas já feitos para hexágono. |
| Chão | Contínuo, sem divisa de hexágono; as linhas da grade só aparecem ao construir ou mover | Pedido do usuário (2026-11-06): manter a grade na lógica, escondida no visual. |
| Tecnologia | Web: Vite, TypeScript, Three.js e Preact | Mesma base do Outpost 7. Abre no iPhone pela rede, sem instalar. |
| Câmera | Ortográfica, ângulo fixo (yaw 30°, pitch 47°) | É o "2.5D": profundidade dos modelos sem perspectiva. |
| Escopo da v1 | Fatia enxuta (seção 3) | Jogável cedo; o resto da proposta entra por etapas. |
| HUD | Enxuto: pílula de recursos, onda e velocidade, um botão Construir. Refeito na etapa 12 (seção 15): topo em pilha, ⋯ e botões flutuantes | Pedido do usuário. |
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

Robô de equilíbrio: `npm run balance` (seção 10). Efeitos: `npm run fx` (lê a cópia local do pixelfx em `../pixelfx`).

Parâmetros de teste na URL:
- `?jogar` pula a tela de começo;
- `?semente=N` fixa o mapa;
- `?onda=N` começa perto da onda N com +600 de cada recurso;
- `?rapido` faz a primeira onda chegar em 8 s;
- `?semsombra` desliga as sombras.

No console: `game`, `view`, `cam` e `snap('nome')` (salva `reports/snap-nome.png`).

## 3. O que a v1 tem

- **Mapa:** hexagonal de raio 16 (era 13 até a etapa 9; veja a seção 13), sorteado pela semente. Tem florestas, rochas, veios de minério e três fendas na borda norte; a 1ª abre na onda 1, a 2ª na 10 e a 3ª na 20.
- **Começo:** castelo, duas casas, uma fazenda e quatro trabalhadores.
- **Economia:** comida, madeira, pedra, ferro e ouro. O ouro vem das ondas e de chamar a onda antes da hora.
- **Prédios:**

  | Grupo | Prédios |
  | --- | --- |
  | Moradia | casa |
  | Economia | fazenda; serraria (ao lado de floresta); pedreira (ao lado de rocha); mina (em cima do veio) |
  | Defesa | muralha; portão (em cima de uma muralha pronta); torre de arqueiros |
  | Militar | quartel; campo de tiro |

- **Menu do prédio** (desde a etapa 11 é um anel em volta do prédio; veja a seção 14):
  - vida, obra, trabalhadores, fila e guarnição;
  - recrutar (quartel e campo);
  - melhorar (castelo);
  - mover, só entre as ondas;
  - consertar, pagando proporcional ao estrago;
  - destruir, com confirmação e metade do custo de volta.
- **Tropas:**
  - soldado: corpo a corpo, procura o monstro mais perto que dá para alcançar a pé;
  - arqueiro: sobe sozinho para a torre com vaga (cabem 4 por torre), senão guarda o castelo atirando do chão.
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
- **Arqueiros:** sobem sozinhos para torres com vaga, inclusive os que esperam no ponto de encontro. Só quem o jogador mandou para um lugar fica no chão, atirando dali.
  - Até 2026-11-07, quem esperava no ponto de encontro também ficava no chão, e uma torre nova podia ficar vazia (o usuário notou). Corrigido, com teste.
  - **Pôr na torre:** com arqueiros escolhidos, tocar numa torre faz eles subirem (até encher); as outras tropas escolhidas vão até perto dela. Quem sobe sai da escolha. Antes, o toque mandava todos para o chão ao lado da torre, e eles ficavam lá.
  - **Chamar arqueiros:** no menu da torre, puxa os arqueiros no chão mais perto até encher a torre.
  - **4 por torre** (eram 2; pedido do usuário em 2026-11-07). O robô de equilíbrio passou a encher as torres de 4 e ficou na mesma média (22,3 ondas).
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
  - A cura do clérigo ("holy/heal") pinta, no pixelfx, o corpo do boneco de demonstração que está sendo curado (cinza, depois colorido). No jogo esse corpo aparecia como um segundo personagem dentro do efeito (o usuário notou em 2026-11-06). A folha agora sai sem o corpo: a ferramenta carrega uma cópia do efeito com a função `recolor` desligada (opção `semCorpo`), e ficam só pétalas, aro de luz, brilhos e corações. Os outros efeitos com personagem só usam o contorno dele, sem desenhá-lo.
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
- **Mais visual (2026-11-07):** o filho do usuário, de 4 anos, joga e não entendia a escolha só com texto.
  - O topo diz "Vitória!", com uma coroa, e o prêmio em ouro vem numa moeda grande ("+40 ouro").
  - A escolha vem logo depois do título: "Escolha um presente para o reino".
  - Cada bênção é um cartão com o ícone do que melhora (arco, escudo, muralha, castelo, recurso, pessoa) e um ícone menor do efeito (fogo, coração, relógio, coroa), o ganho grande na cor do tipo ("↑ +40%", "×2", "+⅓") e um nome curto ("Flechas mais fortes"); o nome oficial vem pequeno embaixo.
  - O escolhido fica dourado com um ✓, e a frase completa aparece embaixo dos cartões.
  - Os números da onda ganham ícones (monstros, perdas, estragos, comida, produção).
  - Os botões ficam presos no pé do relatório, sempre à vista no celular.
  - Visual de cada bênção em `BOON` e `BOON_COLOR` (`src/ui/App.tsx`).

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
| Morcego gigante | onda 8 (12% da onda) | sprite "bat" do pixelfx | voa a 1,8 m por cima das muralhas, direto para a casa mais perto dele; sem casa, o prédio mais perto do castelo; o castelo por último; nunca muralha, portão ou armadilha (Etapa 10); ataca gente que estiver fora; só flecha, magia e castelo o alcançam |
| Bruxa | onda 9 (1, até 4) | Witch | lenta, cura 10 de vida nos monstros a até 3 m a cada 2,5 s (efeito "healing bloom"). É a xamã da proposta |
| Troll | onda 12 | Monstrosity (rig grande) | 180 de vida, recupera 3% por segundo se não for queimado (magia ou flecha com a bênção Flechas em brasa) nos últimos 3 s |
| Necromante | onda 16 | Necromancer, com cajado | levanta um esqueleto ao lado a cada 6 s, até 5 vivos (efeito "soul rise") |
| Golem de gelo (chefe) | onda 15, 45, 75… | FrostGolem | 2500 de vida (cresce com a onda), golpe de 60, derruba muralha; flecha não fere |
| Golem de ossos (chefe) | onda 30, 60… | Skeleton_Golem | 3500 de vida, golpe de 70; magia não fere |

- **Quem mira em quê:** soldados e cavaleiros não alcançam quem voa. Arqueiros, torres e castelo não miram no golem de gelo; magos não miram no de ossos.
- **Chefe:** um aviso quando sai da fenda e uma barra de vida no topo da tela enquanto vive. O relatório avisa na onda anterior.
- **Nomes:** os da proposta foram adaptados aos modelos do KayKit local (bruxa no lugar do xamã goblin; golem de gelo e golem de ossos no lugar do golem de pedra e da serpe de cinzas, que não têm modelo).
- **Peso dos efeitos:** com as folhas novas, os efeitos somam cerca de 34 MB na GPU. Vale medir no iPhone.

## 10. Relatório opcional, salvar, sons e equilíbrio (Etapa 7)

- **Relatório opcional** (pedido do usuário, 2026-11-06): uma caixa no relatório e no menu do castelo liga ou desliga "Relatório a cada onda vencida".
  - Desligado, a onda vencida vira só um aviso ("Onda 5 resistida: +40 de ouro, 2 caídos.") e o jogo segue.
  - O relatório ainda abre nas ondas com bênção, porque é preciso escolher.
  - A preferência fica no navegador.
- **Salvar e continuar:** a partida se salva sozinha no navegador no fim de cada onda, a cada 30 s de jogo e ao sair da aba.
  - A tela de começo oferece "Continuar partida (onda N)" ou "Nova partida". Perder ou começar outra apaga o salvamento.
  - O sorteio também é salvo: a partida carregada segue igual à original (há teste disso).
  - `src/sim/save.ts`.
- **Sons** (`src/audio/sound.ts`): feitos na hora com Web Audio, sem arquivos.
  - flecha, golpe, morte de monstro, prédio pronto, corneta da onda, fim de onda, feitiço, cura, novo nível e prédio destruído.
  - Cada som tem um intervalo mínimo, para não virar chiado.
  - Botão de som no HUD, ao lado da velocidade (desde a etapa 12, dentro do ⋯); liga no primeiro toque (exigência do iPhone).
- **Robô de equilíbrio:** `npm run balance [sementes] [onda máxima]` (`tools/balance.ts`; `VERBOSE=1` mostra o estado a cada onda). Joga partidas inteiras sem tela.
  - "Nada": só o castelo atira.
  - "Robô": ordem simples de construção, recruta, conserta e pega a primeira bênção.
- **O que o robô mostrou e o que mudou:**
  - Antes: sem fazer nada o castelo caía na onda 2 e o robô na 4. A madeira era o gargalo (14 por minuto) e o castelo nunca se recuperava.
  - Ajustes:

| O quê | De | Para |
| --- | --- | --- |
| Produção por trabalhador e minuto (comida / madeira / pedra / ferro / cristal) | 9 / 7 / 5 / 4 / 1,5 | 10 / 16 / 10 / 8 / 3 |
| Começo | 200 de madeira, 120 de pedra | 250 de madeira, 150 de pedra |
| Castelo | 1000 de vida, dano 6, alcance 8 | 1500 de vida, dano 10, alcance 9, e recupera 5 de vida por segundo entre as ondas |
| Esqueleto | dano 5 | dano 4 |
| Tamanho da onda | 5 + 3 por onda | 4 + 2,5 por onda |
| Golem de gelo | 2500 de vida, golpe 60 | 1800 de vida, golpe 50 |

  - Agora, com 6 sementes: sem fazer nada cai nas ondas 4 a 5 (média 4,5); o robô chega às ondas 15 a 22 (média 17).
  - O primeiro chefe (onda 15) é a parede de quem só tem arqueiros: pede magos ou corpo a corpo.

## 11. Chão com textura, lagos, plantação e rochas (Etapa 8)

Pedido do usuário: texturas de grama, solo e água para disfarçar ainda mais a grade.

- **Grama e solo:** texturas feitas na hora em canvas (folhinhas de grama em cinco verdes; terra com pedrinhas), sem arquivo.
  - São projetadas pela posição no mundo (um quadro a cada 3,5 m), então não seguem a grade.
  - O peso do solo em cada vértice mistura: os terrenos em volta (rocha, veios, fendas e margem de lago puxam para a terra); manchas de ruído pelo campo; e um pátio de terra batida em volta do castelo.
  - O tom do terreno (floresta mais escura, fenda arroxeada) vai por cima.
- **Lagos:** terreno novo, 'water', com um ou dois lagos de 5 a 8 ladrilhos a meia distância, crescendo em volta do centro.
  - Ninguém atravessa (horda e gente) nem constrói na água ("Na água, não"); o morcego voa por cima.
  - O chão afunda aos poucos a partir da margem.
  - A água tem contorno ondulado (a margem passa onde há metade de água em volta, com um pouco de ruído), cor que escurece para o fundo, brilho correndo e espuma na beira.
- **Plantação:** a fazenda virou um canteiro de terra retangular com cinco fileiras de trigo, girado livre, com o moinho num canto. O campo sextavado do pack saiu.
- **Rochas:** os rochedos agora são três pedras soltas do KayKit Forest Nature Pack (Rock 1 a 4), giradas e de tamanhos diferentes, no lugar das montanhas de base sextavada.
- O salvamento guarda o terreno 'water'; partidas salvas antes desta etapa continuam abrindo.

## 12. Defesas novas e ondas variadas (Etapa 9)

Pedido do usuário: as defesas que faltavam da proposta e ondas mais variadas.

| Defesa | Custo | Como age |
| --- | --- | --- |
| Catapulta | 50 madeira · 25 ferro; precisa de uma forja pronta | a cada 4 s, uma pedra no monstro com mais vida entre 3 e 12 m: 60 de dano num raio de 1,4 m. Fere os dois golens, não acerta quem voa; a forja (armas) aumenta o dano |
| Fosso de piche | 30 pedra | armadilha no chão: quem passa anda pela metade. "Acender o piche" (5 de madeira) queima por 8 s, 15 de dano por segundo em quem estiver em cima; com a bênção Flechas em brasa, a primeira flecha num monstro sobre o piche acende sozinha |
| Estacas | 15 madeira | armadilha no chão: a cada segundo, 10 de dano em cada monstro em cima; quebram depois de 20 golpes |

- **Por que catapulta e não balista:** o KayKit local tem torre com catapulta e a pedra do disparo, mas não tem balista. Ela faz o papel que a proposta dava à balista (a resposta para trolls e golens), com dano em área no lugar de perfurar a fila.
- **Armadilhas:** não bloqueiam ninguém. A horda passa por cima sem parar para bater, e a gente do reino também atravessa.
- **Modificadores de onda:** um a cada 5 ondas (5, 10, 15…) e dois a partir da 30. O sorteio é fixo pela semente, então o relatório e a pílula da onda já avisam qual vem.

| Modificador | Efeito |
| --- | --- |
| Noite sem lua | torres, castelo, catapultas, arqueiros e magos alcançam 20% menos; a luz da cena cai durante a onda |
| Blindados | a horda sente 25% menos de todo dano |
| Enxame | 60% mais esqueletos (e mais 3) |
| Fúria | a horda anda 30% mais rápido |

- **Onde aparece:**
  - na pílula da onda, entre parênteses antes ("Onda 10 (Blindados) em 1:30") e durante ("Onda 10 · Blindados · 23 monstros");
  - num aviso quando a onda começa;
  - no relatório da onda anterior, com a explicação.
- **Robô (6 sementes):** com os modificadores e sem usar as defesas novas, caiu para a média de 15,7. Usando catapultas e estacas, subiu para 19,5 (ondas 10 a 28). Sem fazer nada, o castelo cai na onda 4.
- **Arte:** catapulta = torre com catapulta e pedra do pack medieval; piche e estacas são feitos no projeto; o impacto da pedra usa a explosão de terra do pixelfx, menor.

## 13. Ferramentas, mapa maior e morcego (Etapa 10)

Pedido do usuário em 2026-11-06: ferramentas na mão dos trabalhadores e um mapa um pouco maior.

- **Ferramentas** (KayKit RPG Tools Bits): o trabalhador leva a ferramenta do serviço desde que sai para ele, e fica de mãos vazias sem serviço.

| Serviço | Ferramenta | Animação |
| --- | --- | --- |
| Fazenda | pá | Digging |
| Serraria | machado | Chopping |
| Pedreira e mina | picareta | Pickaxing |
| Engenheiro (conserto) | martelo (troca o do pack medieval, que ficava minúsculo) | Hammering |

  - As ferramentas são 30% maiores que o modelo, para aparecer de longe por baixo do chapéu.
  - A pá do pack vem com a lâmina do lado do cabo; ela é virada ao carregar, para a lâmina ir ao chão.
  - `CharView.setTool` em `src/render/chars.ts`; a escolha fica em `syncDynamic` (`src/render/world3d.ts`).
- **Mapa de raio 16** (era 13): cerca de 50% mais área (817 ladrilhos contra 547).
  - Florestas e rochas crescem na proporção da área e vão até perto da borda; lagos também podem ficar mais longe.
  - A câmera afasta mais (zoom máximo 54) e anda até perto da borda; a sombra cobre o mapa inteiro.
  - O jogo salvo guarda o raio. Um salvo de antes (sem raio) continua no mapa de 13.
  - `npm run balance` aceita `RAIO=13` para comparar com o mapa antigo.
- **Defeito do morcego corrigido:** ele atacava o prédio mais perto de si.
  - Uma mina junto das fendas virava alvo fora do alcance das torres; os engenheiros consertavam mais rápido que o morcego derrubava, e a onda nunca acabava.
  - O robô "caía" quando acabava o tempo da partida, então os números das etapas 7 e 9 estavam distorcidos.
  - Agora ele vai para as casas (a regra que a seção 9 já prometia). Há teste.
- **Robô (6 sementes), depois da correção:**
  - raio 16: ondas 15 a 27 (média 22,8);
  - raio 13: ondas 15 a 26 (média 21,3);
  - sem fazer nada: onda 4.
  - O mapa maior dá alguns segundos a mais até a horda chegar.

## 14. Menu circular do prédio (Etapa 11)

Pedido do usuário em 2026-11-06, depois do esboço "Menu circular de prédio" no canvas de design. Vale no computador e no celular. Substitui o painel quadrado.

- **Sem fundo escuro** (etapa 12): os botões flutuam sobre o mapa, e os rótulos são letra clara com contorno.
- **Anel:** tocar no prédio abre os botões num anel em volta dele, e o anel acompanha o prédio ao arrastar e dar zoom. Tocar fora (ou Esc) fecha.
  - Se o prédio sai da tela, o anel some e volta quando ele reaparece; a seleção continua.
- **Casas fixas:** cada ação tem o seu lugar, para a mão decorar. Prédio sem a ação deixa a casa vazia.

| Casa | Ação |
| --- | --- |
| Topo | a principal: Recrutar (prédios de tropa), Melhorar (castelo), Melhorias (forja), Acender (piche), Chamar arqueiros (torre) |
| Direita | Encontro (prédios de tropa), Recolher ou Liberar (castelo) |
| Baixo à direita | Consertar |
| Baixo à esquerda | Destruir (o castelo não tem) |
| Esquerda | Mover; no castelo, que não se move, o liga-desliga do relatório |

- **Cartão:** nome, vida, obra, trabalho, fila ou arqueiros, e o que o botão em foco faz e custa.
  - Fica acima do anel, longe do dedo. Sem espaço entre o anel e o HUD, desce para baixo do anel.
  - Sem botão em foco, mostra a ação principal; prédio sem ação principal mostra a nota dele (torre, catapulta, estacas, piche, castelo).
- **Toques:**
  - um toque executa;
  - botão apagado não executa: o toque mostra o motivo no cartão;
  - segurar o botão (ou passar o mouse) só mostra a explicação;
  - Destruir pede dois toques: o primeiro vira uma pílula vermelha "Toque de novo para destruir" e apaga os outros botões; tocar fora ou Esc cancela.
- **Recrutar:** a fila aparece no número dourado e o próximo recruta num aro em volta do botão.
- **Forja:** Melhorias troca o anel pelas três linhas (armas, armaduras, pontas), com o nível no rótulo. O botão do meio volta.
- **Borda de baixo:** com o prédio colado nela, o anel vira leque aberto para cima, na mesma ordem em volta e com raio maior. Perto das laterais, o anel encosta para dentro da tela.
- **Código:** `src/ui/Radial.tsx` (o anel e o cartão); ícones e texto de custo em `src/ui/common.tsx`; estilos `.radial`, `.rbtn` e `.rcard` em `src/ui/style.css`.

## 15. HUD novo e Construir em leque (Etapa 12)

Pedido do usuário em 2026-11-06, depois das pranchetas "HUD hoje no celular" e "HUD proposto" (versão 3) no canvas de design. A responsividade no celular estava ruim: peças soltas por cima do mapa se encavalavam.

- **Topo em pilha** (`.hud-stack`): um bloco só, nada fica por cima de nada.

| Formato | Quando | Como fica |
| --- | --- | --- |
| Celular em pé | largura até 599 px | duas linhas: castelo, onda, pausa e ritmo; recursos com o ⋯ no fim. O chefe embaixo, na largura toda |
| Celular deitado | altura até 499 px | uma linha só (40 px): castelo, onda, recursos, pausa, ritmo e ⋯. O chefe no meio, embaixo |
| Computador e tablet | o resto | uma linha só (44 px); a partir de 1200 px, cada recurso ganha o nome |

- **Castelo:** ícone, barra e o número da vida; borda vermelha abaixo de 35%. Tocar leva a câmera até o castelo e abre o anel dele. Em pé, o número fica em cima e a barra embaixo.
- **Onda:** número e monstros vivos; embaixo, o modificador. No calmo, "em 1:24 · chamar" (ou "Blindados · em 1:24" quando a próxima tem modificador), e tocar chama a onda.
- **Ritmo:** pausar (vira ▶ dourado quando pausado) e um botão que alterna 1×, 2× e 3× e tira da pausa.
- **Recursos:** uma faixa, números curtos a partir de 1.000 (1,2k, 12k). O cristal só aparece com estoque ou com uma mina no veio de cristal. As tropas saíram dali e viraram o número no Selecionar.
- **⋯:** som, relatório a cada onda vencida, **Nova partida** (com confirmação, porque apaga o jogo salvo; pedido do usuário em 2026-11-07) e o diário de avisos (os 40 últimos, o mais novo primeiro, com a onda).
- **Avisos:** no celular (largura até 599 ou altura até 499) não aparecem na tela; vão para o diário, e o ⋯ ganha um ponto vermelho. No computador continuam embaixo à esquerda, e também vão para o diário.
- **Botões flutuantes embaixo à direita, sem fundo** (pedido do usuário, depois da primeira versão com o martelo no meio): o martelo dourado no canto (Construir, 60 px) e o Selecionar ao lado dele (52 px, com o número de tropas; só aparece com tropas), alinhados pela base e com 28 px entre eles. No computador ganham rótulo embaixo, e os avisos ficam no canto de baixo à esquerda.
- **Construir em leque:**
  - o martelo abre um quarto de círculo, para a esquerda e para cima, com Economia (4), Casa, Defesa (6) e Militar (7). Moradia só tem a casa, então "Casa" coloca direto;
  - tocar numa categoria troca o leque pelas opções dela; com mais de 4, elas vão em duas fileiras (metade perto do martelo, metade mais longe), para os rótulos não se encostarem;
  - o martelo vira X (fecha) nas categorias e seta (volta) dentro de uma; tocar fora ou Esc também;
  - o Selecionar some enquanto o leque está aberto;
  - o cartão mostra nome, custo em ícones e para que serve; opção bloqueada (falta recurso, nível do castelo, forja) fica apagada e o toque mostra o motivo;
  - um toque vai para o mapa colocar; segurar (ou passar o mouse) só mostra o cartão;
  - deitado, o cartão vai para o lado do leque quando em cima encostaria no HUD.
- **Código:** `Hud` e `MoreMenu` em `src/ui/App.tsx`; `BuildFan` em `src/ui/Radial.tsx` (com os toques compartilhados com o menu do prédio, `pressProps`); diário e ritmo em `src/game/game.ts` (`log`, `unread`, `togglePause`, `cycleSpeed`); estilos no fim de `src/ui/style.css`.

## 16. Arquitetura

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
- `src/ui/App.tsx`: HUD, ⋯, botões flutuantes, avisos e telas de começo e fim. O menu do prédio e o leque do Construir ficam em `src/ui/Radial.tsx` (seções 14 e 15).

## 17. Etapas

| Etapa | O que | Situação |
| --- | --- | --- |
| 1 | Fatia jogável: tudo da seção 3 | Pronta em 2026-11-06. Testada no navegador do Mac (computador e tela de celular); falta jogar no iPhone. |
| 2 | Tropas sem teto, ponto de encontro dos prédios, escolher tropas e mandar para um ponto (seção 5) | Pronta em 2026-11-06. Testada no navegador do Mac. |
| 3 | Efeitos do pixelfx (seção 6) | Pronta em 2026-11-06. Vista no navegador do Mac; falta jogar no iPhone. |
| 4 | Relatório de fim de onda e bênçãos a cada 4 ondas (seção 7) | Pronta em 2026-11-06. Vista no navegador do Mac; falta jogar no iPhone. |
| 5 | Cristal; mago, clérigo, cavaleiro e engenheiro; torre do mago, capela, estábulo, forja e oficina (seção 8) | Pronta em 2026-11-06. Vista no navegador do Mac; falta jogar no iPhone. |
| 6 | Morcego, bruxa, troll, necromante e dois chefes (seção 9) | Pronta em 2026-11-06. Vista no navegador do Mac; falta jogar no iPhone. |
| 7 | Relatório opcional, salvar e continuar, sons e equilíbrio com robô de teste (seção 10) | Pronta em 2026-11-06. Vista no navegador do Mac; falta jogar no iPhone (e ouvir os sons). |
| 8 | Texturas de grama e solo, lagos com água animada, plantação e rochas sem base hexagonal (seção 11) | Pronta em 2026-11-06. Vista no navegador do Mac; falta jogar no iPhone. |
| 9 | Catapulta, fosso de piche, estacas e um modificador de onda a cada 5 ondas (seção 12) | Pronta em 2026-11-06. Vista no navegador do Mac; falta jogar no iPhone. |
| 10 | Ferramentas na mão dos trabalhadores, mapa de raio 16 e correção do alvo do morcego (seção 13) | Pronta em 2026-11-06. Vista no navegador do Mac; falta jogar no iPhone. |
| 11 | Menu circular do prédio no lugar do painel quadrado, no computador e no celular (seção 14) | Pronta em 2026-11-06. Vista no navegador do Mac, em tamanho de computador e de celular; falta jogar no iPhone. |
| 12 | HUD novo: topo em pilha, ritmo em dois botões, ⋯ com diário, avisos fora da tela no celular, botões flutuantes e Construir em leque (seção 15) | Pronta em 2026-11-06. Vista no navegador do Mac em 1024×768, 375×812, 844×390 e 360×640; falta jogar no iPhone. |

## 18. Arte e licenças

Tudo do KayKit (Kay Lousberg, CC0), copiado da coleção local por `npm run art` (lista em `tools/art-manifest.ts`). Detalhes em `LICENSES.md`.

| Pack | O que vem dele |
| --- | --- |
| Medieval Hexagon Pack | ladrilho, prédios, muralhas, natureza, flecha |
| Adventurers 2.0 | cavaleiro, arqueira, espada, escudo, arco |
| Skeletons | esqueleto, lâmina |
| Mystery Monthly | fazendeiros, lobisomem, orc saqueador e machado, orc bruto |
| Resource Bits | minério |
| RPG Tools Bits | pá, machado, picareta e martelo |
| Character Animations | todas as animações |

Os efeitos vêm do pixelfx (MIT); detalhes na seção 6 e em `LICENSES.md`.
