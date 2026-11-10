# Hordas & Hortas

Tower defense sem fim em 2.5D isométrico. O jogador ergue um reino em volta do castelo: planta, corta madeira, quebra pedra, minera ferro, constrói casas para ter quem trabalhe, treina soldados e arqueiros e fecha tudo com muralhas e portões. As hordas saem de fendas na beira do mapa (o lugar muda a cada partida), a cada onda maiores, mais fortes e mais variadas. A partida acaba quando o castelo cai.

Nome definitivo desde 2026-11-09, escolhido pelo usuário; até a Etapa 19 o jogo se chamava "Reino Sitiado", nome que ficou no endereço, no repositório, na pasta e neste arquivo (seção 22, "Nome e ícone"). Proposta visual (canvas, design system Vigília): https://claude.ai/artifact/E2kdbKNuRkqvb9bmsePrsy

Repositório: https://github.com/welingtonfidelis/reino-sitiado-game (criado pelo usuário em 2026-11-06). As etapas 1 a 16 estão na `main`; cada etapa tem o seu commit ("Etapa N: …" no `git log`). O jogo é publicado no GitHub Pages a cada push na `main`: https://welingtonfidelis.github.io/reino-sitiado-game/ (`.github/workflows/pages.yml`; a build usa `--base=/reino-sitiado-game/`). Commit e push só quando o usuário pedir.

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

- **Mapa:** hexagonal de raio 16 (era 13 até a etapa 9; veja a seção 13), sorteado pela semente. Tem florestas, rochas, veios de minério e três fendas em pontos sorteados da borda (até 2026-11-07 ficavam sempre ao norte; veja a seção 21); a 1ª abre na onda 1, a 2ª na 10 e a 3ª na 20.
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

## 16. Queda do castelo (Etapa 13)

Pedido do usuário em 2026-11-07 ("enfeites"). Antes, o castelo sumia e o diálogo "O castelo caiu" aparecia no mesmo instante; para uma criança, não ficava claro o que tinha acontecido.

- **Uns 3 s antes do diálogo** (`FALL_TIME` = 3,4 s em `src/game/game.ts`):
  - a câmera vai até o castelo e aproxima até a vista de 18 m;
  - o castelo treme forte por 0,8 s, com nuvens de poeira (pixelfx "poof") em volta da base;
  - de 0,6 s a 2,6 s ele afunda 4,8 m inclinando, com explosões de terra a cada 0,4 s; os escombros já estão no ladrilho, então ele some dentro deles;
  - aos 2,7 s, um estouro final de terra e poeira;
  - um estrondo grave e comprido (som "queda", feito na hora).
- O mundo congela na derrota (personagens parados), mas a queda e a poeira andam em tempo real (`fxDt` em `syncDynamic`).
- A simulação para no instante da derrota; o jogo chama `refresh` na hora, para o castelo sair do desenho e os escombros entrarem (antes ele continuaria desenhado).
- Código: `startFall`/`stepFall` em `src/render/world3d.ts` (uma cópia do modelo do castelo e da bandeira); `fallT`/`fallAt` no `Game`; a câmera no laço de `src/main.tsx`.

## 17. Heróis (Etapa 14)

Pedido do usuário em 2026-11-07: para o jogo não ficar repetitivo quando sobra recurso e exército, heróis especiais comprados no castelo, caros, para o fim do jogo.

- **Por quê ouro:** o robô de equilíbrio mostrou que, no fim, sobra ouro (~800 na onda 16, ~2.600 na 28) e falta ferro (quase zero). Os heróis custam ouro e um pouco de cristal, nunca ferro.
- **Onde:** no anel do castelo, a casa de baixo à esquerda (o castelo não tem Destruir) vira "Heróis", que abre um submenu com os quatro, como a forja. Libera com o castelo **nível 2**.
  - Primeiro pensei no nível 3, mas ele pede ferro e o robô só chegava lá pela onda 28; no 2, o primeiro herói vem por volta da onda 16.
- **Preço:** 600 de ouro e 30 de cristal; +50% a cada herói que o reino já tem (900, 1.350, 2.025). Um de cada.
- **Não morre:** com a vida a zero, desmaia, some para dentro do castelo e volta pela porta 45 s depois, de vida cheia. Ninguém perde a compra.
- **Nível 1 a 5:** sobe pelo dano que causa (400, 1.000, 2.000 e 3.600 de dano no total); cada nível dá +20% de vida e de dano. Ao subir, aparece "NOVO NÍVEL" em cima dele e um aviso.
- **Golpe especial automático** (sem precisar mandar):

| Herói | Modelo e arma | Ataque | Golpe especial | Recarga |
| --- | --- | --- | --- | --- |
| Bárbaro | Barbarian, machado de duas mãos | corpo a corpo forte (30) | giro do machado: o triplo do dano em todos a até 1,9 m | 8 s |
| Atiradora | Rogue_Hooded, besta | de longe (9,5 m) | chuva de virotes onde a horda está mais junta (até 12 m): 35 em todos a 2,3 m; acerta quem voa | 10 s |
| Druida | Druid, cajado | magia (6,5 m) | raízes prendem a horda a até 4 m por 3 s, e quem é do reino ali se cura 30 | 10 s |
| Cavaleiro Negro | BlackKnight, espada e escudo | corpo a corpo (40), o dobro nos chefes | pisão: 45 (o dobro nos chefes) e atordoa todos a até 2,5 m por 2 s | 9 s |

- **Na tela:** anel dourado no chão e barra de vida dourada sempre à vista; o Bárbaro gira na animação durante o golpe; a Atiradora e o Bárbaro usam as animações de duas mãos. Efeitos do pixelfx: giro (melee/spin-slash), chuva (arcane/star-fall), raízes (nature/root-snare, em cada monstro preso), pisão (impacts/heavy-landing) e um cone de luz (holy/blessing) quando o herói chega ou volta.
- **Escolher:** no submenu, herói comprado aparece com o nível no número dourado; tocar nele escolhe o herói para mandar para um lugar. Os heróis também entram no Selecionar.
- **Robô (6 sementes):** com heróis, 22,5 ondas em média; sem heróis (`HEROIS=0 npm run balance`), 22,3. Eles chegam no fim e ajudam sem tirar o desafio; o ouro deixa de se acumular.
- **Código:** `HERO_KINDS`, `HERO_INFO` e `CONFIG.heroes` em `src/sim/config.ts`; comportamento, golpes, nível e desmaio em `src/sim/step.ts` (`heroStep`, `heroSpecial`, `knockDown`); compra em `src/sim/commands.ts` (`buyHero`, `heroCost`, `heroProblem`); submenu em `src/ui/Radial.tsx` (`heroActs`).

## 18. Fazenda com celeiro (Etapa 15)

Pedido do usuário: um celeiro no centro, num hexágono, e as plantações em volta dele, cada uma no seu hexágono, pelo mesmo preço; só uma mudança visual. Aprovado pelo usuário em 2026-11-07.

- **Celeiro** (novo, Economia): 30 de madeira. É o moinho do pack medieval no centro do hexágono, com fardos de feno, sacos e o carrinho de mão em volta. Não produz nada; é o centro da fazenda.
- **Plantação** (a antiga fazenda, mesmo preço e produção: 20 de madeira, 2 trabalhadores, comida): só vai num hexágono ao lado de um celeiro ("A plantação vai ao lado de um celeiro"). É um canteiro de terra do tamanho do hexágono inteiro, então as plantações vizinhas se encostam sem grama no meio (pedido do usuário), com fileiras de trigo apontando para o celeiro; o moinho pequeno no canto saiu.
- **Uma planta por plantação** (ideia do usuário): em volta de cada celeiro, na ordem em que são construídas, as plantações recebem milho, tomate, trigo, alface, cenoura e abóbora (seis, uma por hexágono vizinho). Só muda o desenho e o nome no cartão ("Plantação de milho"); a comida é a mesma. Plantação sem celeiro (jogos salvos antigos) pega uma planta pelo número dela. `cropOf` em `src/sim/world.ts`; modelos em `cropModel` (`world3d.ts`).
- **Começo do jogo:** celeiro em (-3, 1), a 3 hexágonos do castelo, e uma plantação encostada nele, em (-3, 2). Assim nenhuma plantação em volta do celeiro encosta no castelo (pedido do usuário); os dois ladrilhos viram grama na criação do mapa.
- **Jogos salvos antigos:** as fazendas de antes continuam de pé e produzindo; a regra só vale para construir ou mover.
- **Robô:** quando não há vaga em volta dos celeiros, ergue outro. Com 12 mapas, 22,4 ondas em média, contra 21,3 antes; a diferença é ruído, a dificuldade não muda.
- Código: `site: 'nearBarn'` em `src/sim/config.ts` e `placeProblem`; desenho em `world3d.ts` (`farmModel` e o celeiro no `syncStatic`).

## 19. Festa, mundo vivo, estações, música e álbum (Etapa 16)

Pedido do usuário em 2026-11-07, a partir de uma lista de ideias para o jogador não enjoar: a festa da vitória, o mundo vivo e o álbum de figurinhas, mais clima e estações e música ambiente. Sem esqueletos saindo do chão: todo monstro vem de outra dimensão, pelos portais.

- **Festa da vitória:** ao vencer a onda, fogos estouram em volta do castelo (com som de assobio e estalo), cai confete e todo mundo que não está lutando comemora (animação Cheering). Dura 3,4 s; numa onda de chefe, 6 s, com mais fogos e mais confete. O relatório espera a festa (`PARTY_TIME`, 3,2 s) e, enquanto ele está aberto, a festa continua andando (os personagens e os efeitos usam o tempo real).
- **Gente parada:** trabalhador sem serviço senta no chão; soldado, cavaleiro, Bárbaro e Cavaleiro Negro fazem flexões de vez em quando; os outros acenam. Cada um no seu ritmo (`idlePose` em `world3d.ts`).
- **Bichos:** uma borboleta voando em cada plantação (fora do inverno), três pássaros cruzando o céu e um peixe pulando num lago a cada poucos segundos (no inverno, não). Tudo com folhas do pixelfx (seção 6 e `LICENSES.md`).
- **Sombras de nuvem:** manchas escuras andando devagar pelo chão (ruído no sombreador do chão).
- **Estações** (só no visual): mudam a cada 5 ondas. Ondas 1 a 5 primavera, 6 a 10 verão, 11 a 15 outono, 16 a 20 inverno, e de novo. Na calmaria vale a onda que vem; a troca entra depois da festa e do relatório, com um cartão grande no meio da tela (figura e nome) e um selinho da estação no canto da caveira da onda.
  - Primavera: metade das árvores com flor rosa, grama viva, pétalas caindo; chuva em algumas ondas.
  - Verão: verde escuro, grama mais quente, pólen no ar.
  - Outono: copas laranja e vermelhas, grama amarelada, folhas caindo; chuva em metade das ondas (a luz cai um pouco).
  - Inverno: neve no chão em manchas, nos telhados, nas pedras e nas copas; flocos caindo; sem borboletas nem peixes.
  - Código: `seasonOf` em `src/sim/config.ts`; materiais, tempo e partículas em `src/render/season.ts` (as árvores ganham uma cópia do material; o resto, neve no que olha para cima).
- **Música ambiente** (`src/audio/music.ts`), feita na hora como os sons: na calmaria, um tema calmo em dó maior (dedilhado, acordes macios e baixo, 84 bpm); na onda, um tema de batalha em lá menor com tambores (116 bpm). São 16 compassos: 8 com a melodia inteira e 8 só com umas notas soltas. Troca suave entre os dois e silêncio na derrota. Liga e desliga no ⋯ ("Música", guardado no navegador); só toca com o som ligado. Fica bem abaixo dos efeitos.
- **Álbum de figurinhas** (`src/game/album.ts`): 25 conquistas que ficam de uma partida para outra (no navegador, `reino.album`). Cada uma é uma figura grande com cor própria; quando ganha, aparece embaixo, no meio da tela, com "Figurinha nova!" e um arpejo, e o ⋯ ganha um ponto vermelho. O álbum abre pelo ⋯ ("Álbum de figurinhas 3/25"): as ganhas coloridas (as novas brilham), as que faltam em cinza com a dica embaixo, para quem lê junto. Exemplos: 4 casas, primeira torre, torre com 4 arqueiros, 6 plantações num celeiro, as 6 plantas, castelo nível 4, 20 tropas, 1000 de ouro, primeiro herói, os 4 heróis, herói nível 5, ondas 5, 10, 20 e 30, chefe vencido, onda sem caídos, primeiro inverno, 100 e 1000 monstros.

### Ajustes depois da Etapa 16 (2026-11-07)

Pedidos do usuário depois de jogar:

- **Pedreira diferente da mina:** as duas usavam o mesmo modelo, só com outra cor. A mina continua sendo a entrada no morro. A pedreira virou um pátio a céu aberto (`quarry` em `world3d.ts`), com:
  - barraca;
  - blocos de pedra cortada empilhados e com cinta (Resource Bits);
  - pedra cortada, lascas, carrinho e caixote.
  
  Tudo fica virado para a rocha vizinha, e a beira desse lado fica livre para os trabalhadores.
- **Trabalhadores virados para o serviço:** antes cada um parava em volta do prédio e ficava virado para onde vinha andando (o lenhador cortava o ar). A regra agora é a `workSpot` em `step.ts`:
  - na serraria e na pedreira, os dois ficam lado a lado na beira que dá para a floresta ou a rocha (`resourceDir` em `world.ts`) e batem nela;
  - na mina e na fazenda, ficam em volta, virados para o meio;
  - quem chega pega a primeira vaga livre (antes, quem chegava depois de alguém sair podia cair no mesmo lugar de outro);
  - num salvo antigo, quem está fora do lugar anda até a beira certa.
  
  Tem teste.
- **Torre aberta:** a torre dos arqueiros virou a torre de vigia de madeira do KayKit (`building_watchtower_blue`, 1,8× maior), aberta em cima.
  - Os arqueiros aparecem na plataforma, um em cada canto.
  - Atirando, viram para o monstro; sem monstro, olham para fora. Na festa, comemoram lá em cima.
  - A flecha sai de 2,0 m de altura, a altura do arqueiro.
- **Gráficos leves** (o filho do usuário joga num tablet Samsung de entrada): opção no ⋯, "Gráficos normais" (mais bonito) ou "Gráficos leves" (roda melhor), guardada no navegador (`reino.graficos`; `src/render/quality.ts`).
  - O leve desenha:
    - na resolução da tela (sem o dobro das telas finas);
    - sem sombras;
    - com 35% da chuva, neve, pétalas e folhas;
    - sem borboletas, pássaros, peixes nem sombra das nuvens;
    - a 30 quadros por segundo.
  - O antisserrilhado só muda ao abrir o jogo de novo (o WebGL não troca isso com o jogo aberto).
  - Sem escolha guardada, um aparelho de toque que o Chrome diz ter 4 GB de memória ou menos já começa no leve. O Safari do iPhone não diz a memória, então lá começa no normal.
  - A simulação é a mesma nos dois modos.
- **Personagens numa peça só** (vale para os dois modos): cada personagem do KayKit vem em 6 a 12 peças (corpo, cabeça, braços, pernas, chapéu), cada uma um desenho. Ao carregar, as peças que usam o mesmo material viram uma malha só (`mergeSkinned` em `assets.ts`). São 1 ou 2 desenhos por personagem.
- **Cada boneco no seu ritmo**: trabalhadores, tropas e monstros que começavam a mesma animação no mesmo instante (chegar ao serviço, entrar na luta, abrir o jogo) se mexiam em compasso, como se fossem um só. Agora a animação em laço entra num ponto qualquer dela e cada boneco tem um ritmo próprio (±8%), então ninguém bate a enxada, marcha ou atira junto com o vizinho (`CharView` em `chars.ts`). A queda e o giro do Bárbaro continuam contando do começo.
- **Vilinha em vez de casas soltas** (o usuário achou as casas soltas, sem cara de bairro; tudo só no desenho, a simulação não muda; `src/render/village.ts`):
  - **Chão de vila**: cada casa tem um quintal de terra batida, que emenda no da casa vizinha. É um mapa de 512 px visto de cima, pintado em canvas a cada mudança do mundo (`paintVillage` em `ground.ts`) e misturado no shader do chão como terra.
  - **Ruas**: da casa mais perto do castelo para a mais longe, cada uma abre uma trilha da porta até a rede de ruas (o castelo, as trilhas já feitas e as casas já ligadas). A trilha acaba onde encontra outra, então vira rua em vez de uma trilha por casa. A busca é incremental: a rede só cresce, então cada casa só corrige o que ficou mais perto (2 ms com 17 casas, só quando um prédio muda). Casa encostada numa já ligada não abre trilha, porque o quintal já liga as duas. As trilhas fogem de rocha, água, fenda e prédios, cortam mato só se precisarem e passam por portão e armadilha.
  - **Porta para a rua**: a porta (o +Z do modelo) dá para o primeiro passo da trilha. Sem trilha, dá para o lado do castelo que não tenha outra casa.
  - **Quintal com enfeites**: a casa está 15% maior. Dos lados da porta ficam barril e balde, feno e saco, ou carrinho e caixas (varia pelo id). A cerca nos fundos foi testada e o usuário pediu para tirar.
  - **Pracinha**: o canto em comum de três casas encostadas ganha um poço (no máximo um a cada 3,5 m), e as casas se afastam um pouco dele.
  - **Taverna e mercado**: um bairro (casas encostadas) de 5 casas ganha taverna na casa mais cercada, e um de 8 ganha também o mercado. O modelo troca, mas as vagas são as mesmas.
  - **Prédios de tropa também** (pedido do usuário): quartel, campo de tiro, capela, estábulo, forja e oficina entram nas ruas como as casas, com quintal e porta virada para a trilha (`LINKED` em `village.ts`). Ficam de fora os prédios de trabalho (celeiro, plantação, serraria, pedreira, mina), as torres (arqueiros, mago, catapulta), as muralhas e as armadilhas.
- **Mudar de lugar custa tempo** (pedido do usuário). Antes o prédio pulava na hora. Agora:
  - **Desmontar**: o prédio é desmontado onde está, em 75% do tempo da obra (no mínimo 3 s). Ele baixa dentro do andaime, levanta poeira e mostra uma barra laranja que esvazia. Os trabalhadores dele martelam, e a bandeira azul marca o lugar novo, que fica guardado (`moveTo`).
  - **Montar**: no lugar novo ele vira obra e sobe dentro do andaime no tempo da obra inteira (`moved`), com barra dourada e os trabalhadores martelando de novo.
  - **Enquanto isso, não funciona**: não produz, não treina, não atira, a casa não abriga. Os arqueiros descem da torre e voltam sozinhos quando ela fica pronta.
  - **Limites**: obra nova não muda de lugar ("Espere a obra terminar"), e prédio de mudança não muda de novo. Derrubar no meio devolve só a metade. Se uma fenda abrir no lugar guardado, ele remonta onde estava.
  - **Onde está**: `moveBuilding` em `commands.ts`; `unpack` e `construction` em `step.ts`; `moverLook` e `syncMovers` em `world3d.ts`. O salvo guarda a mudança no meio.
  - Com 32 personagens na tela, os desenhos por quadro caíram de 403 para 164.
  - No Mac, o leve desenha cada quadro em cerca de metade do tempo do normal.

## 20. Recursos que acabam e reaparecem (Etapa 17)

Pedido do usuário (2026-11-07): como no Age of Empires, floresta, rocha e veio se esgotam, e a extração precisa mudar de lugar (a mudança custa tempo; ver os ajustes da seção 19). Como o jogo não tem fim, o que acaba num lugar nasce em outro. O lugar novo nunca fica em cima de construção, nem perto demais do castelo, nem perto dos portais. No meio da etapa o usuário pediu que a plantação também acabasse, com um ícone avisando e Replantar no menu dela. Isso troca a proposta, que era plantação sem fim.

### O que acaba

| Recurso | Fonte | Estoque | Quanto dura com 2 trabalhadores |
| --- | --- | --- | --- |
| Madeira | floresta vizinha da serraria | 300 por hexágono | ~9 min por hexágono; com 2 ou 3 vizinhos de floresta, 20 a 30 min |
| Pedra | rocha vizinha da pedreira | 400 por hexágono | ~20 min por hexágono |
| Ferro | o veio debaixo da mina | 250 | ~15 min |
| Cristal | o veio azul debaixo da mina | 120 | ~20 min (o cristal sai devagar) |
| Comida | a plantação | 300 por semeadura | ~15 min; depois, Replantar (10 de madeira) |

Os números ficam em `CONFIG.deposits` e `CONFIG.farm`.

### Simulação (`src/sim/deposits.ts`)

- **Estoque no ladrilho**: cada ladrilho tem `stock`, cheio na criação do mapa conforme o terreno. A plantação guarda a colheita no próprio prédio (`harvest`). O salvo guarda os dois; um salvo antigo enche tudo.
- **De onde sai**: a serraria e a pedreira tiram do vizinho do tipo certo que ainda tem estoque (`sourceOf`); o `resourceDir` aponta para ele, e os trabalhadores viram para lá. A mina tira do veio debaixo dela. As bênçãos aumentam o ganho, mas não gastam mais estoque.
- **Quando um hexágono acaba**: a floresta vira grama com toras, a rocha vira grama com cascalho (e abre caminho), e o veio vira chão comum. O hexágono entra na conta do tipo (`w.regrow`).
- **Prédio sem recurso (`dry`)**: para e solta quem trabalhava nele (vão para outro serviço). A serraria, a pedreira e a mina voltam sozinhas quando mudam para perto de recurso; a plantação colhida volta com Replantar.
- **Desenho em degraus**: o estoque tem três degraus. Ao passar de um para outro, o mundo pede redesenho.

### Onde o recurso novo nasce

**Quando** (muda a proposta): em vez de um piso de estoque no mapa, cada hexágono que acaba entra numa conta. No fim da onda, quando a conta chega a 3 florestas, 2 rochas ou 1 veio, nasce uma mancha nova:
- floresta: 4 a 6 hexágonos;
- rocha: 2 ou 3, com os veios que faltam encostados (cristal primeiro, se faltar).

O motivo da troca: o mapa começa com perto de 90 hexágonos de floresta, e um piso quase nunca seria alcançado numa partida. A conta repõe o que se gastou.

**Regras do lugar** (todas, em cada hexágono):
1. É grama, sem prédio, obra, ruína ou lugar guardado de mudança.
2. Está a 1 hexágono ou mais de prédio e de lugar guardado.
3. Está a 6 hexágonos ou mais do castelo.
4. Está a 5 hexágonos ou mais de cada portal, aberto ou fechado.
5. Fica até R − 2 e fora de água e fenda.
6. Não tem gente nem monstro em cima.
7. Fica a 3 hexágonos ou mais de outra mancha do mesmo tipo. Esta regra cai se não houver lugar nenhum.

O lugar onde um recurso acabou volta a valer quando nenhum prédio fica encostado nele (a floresta nova cobre as toras).

**Teste do caminho:** rocha nova não fecha caminho. Cada portal ainda chega ao castelo e a gente ainda chega a todo prédio que alcançava; senão, a mancha é desfeita e o sorteio tenta outro lugar (até 60 vezes).

### Como a criança percebe

- **O terreno mostra o estoque**:
  - a floresta rareia (grupo grande, grupo menor, uma árvore só, toras);
  - a rocha encolhe (rochedo, pedras com lascas, cascalho);
  - o minério e o cristal ao lado da mina diminuem;
  - as plantas da plantação baixam até o toco.
- **Prédio sem recurso**: balão com o recurso riscado em vermelho, balançando em cima dele (`src/render/bubbles.ts`; árvore, pedra, ferro ou espiga). No menu dele:
  - a serraria, a pedreira e a mina mostram o Mover pulsando;
  - a plantação mostra o Replantar pulsando.
  - O cartão ganha a barra Floresta, Rocha, Veio ou Colheita.
- **Recurso novo**: cresce do chão em 1,6 s com brilho. Um balão com o ícone do recurso fica uns 6 s em cima, e um aviso vai para o diário. A plantação replantada também cresce de novo.
- **Chão**: o chão é refeito quando o terreno muda (`w.land`). A floresta que acaba some do tom do chão, e a rocha nova ganha terra em volta.

### Arte

- `Wood_Log_A` e `Wood_Log_B` do Resource Bits (toras, puxadas do LFS da coleção local).
- `tree_single_A` e `tree_single_B` do Medieval (já estavam copiadas).
- O cascalho usa as lascas e pedrinhas que o jogo já tinha.

### Equilíbrio (`npm run balance`)

- **O que o robô aprendeu**:
  - mudar a serraria, a pedreira ou a mina sem recurso para o lugar com recurso livre mais perto (sem lugar, ele derruba);
  - replantar a plantação colhida;
  - escolher onde erguer a extração pesando o recurso livre em volta (0,5 hexágono de distância por hexágono livre, até 2). Antes ele punha duas serrarias encostadas no mesmo hexágono de floresta, que acabava em 6 min.
- **Resultado com 12 sementes**: 20,3 com tudo esgotando, contra 23,2 do mesmo robô sem esgotar (`ESTOQUE=0`). Com as 6 sementes de sempre: 23,2 (antes da etapa, 21,5).
- **Ruído**: o robô cai na onda 15 (chefe) ou passa da 25, sem meio-termo, então cada semente que vira pesa muito na média. Estoques maiores (450 a 600) não mudaram o quadro.
- **Opções novas do robô**: `RECURSOS='{json}'` testa outros números, `SO=n` roda uma semente só, e `ROBO_PESO`/`ROBO_TETO` mudam a escolha de lugar. Com `VERBOSE=1`, ele mostra o que acabou, parou, brotou e desmontou, e quanto produziu.

### O que falta

Jogar no tablet e no iPhone para ver se os tempos estão bons para uma criança e se os balões aparecem bem no celular.

## 21. Modo fácil (Etapa 18)

Pedido do usuário (2026-11-07): um modo fácil de dificuldade, em que uma das mudanças é não ter o esgotamento de recursos. O plano foi aprovado como estava.

### Onde se escolhe

- **Na primeira tela**: dois botões grandes com figura, porque o filho do usuário não lê. O **Fácil** tem um sol; o **Normal** tem espadas. Cada um tem uma linha curta de apoio.
  - Sem partida salva, a tela pergunta "Como quer jogar?" e o toque já começa a partida. Se o modo escolhido for outro, o mapa é refeito com a mesma semente (`Game.begin`).
  - Com partida salva, o Continuar mostra o modo dela, e os dois botões ficam embaixo para começar outra.
- **Nova partida (⋯)** e **tela de derrota**: os mesmos dois botões, com o modo de agora marcado.
- **Travado**: o modo vale a partida inteira e vai no salvo (`w.mode`; salvo antigo é normal). O ⋯ mostra "Modo fácil" ou "Modo normal" no topo.
- **Lembrado**: o último modo escolhido fica no navegador (`reino.modo`) e vem marcado; num aparelho novo, o Fácil. Na URL, `?modo=normal` ou `?modo=facil` escolhe sem passar pela tela (para testes).

### O que muda no Fácil (`MODES` em `config.ts`)

| O quê | Normal | Fácil |
| --- | --- | --- |
| Floresta, rocha, veio e plantação | acabam (Etapa 17) | não acabam: sem estoque gasto, sem reposição; o menu não mostra Replantar nem a barra de estoque |
| Mudar prédio de lugar | desmonta e monta (75% + 100% do tempo da obra) | metade desse tempo |
| Vida dos monstros | como hoje | 30% menos (os esqueletos do necromante também) |
| Monstros por onda | como hoje | 25% menos de cada (o chefe continua um só) |
| Calmaria | 90 s antes da primeira onda (120 s até 2026-11-09); depois 90 s, caindo até 45 s | 120 s antes da primeira, 30 s a mais em cada uma, caindo até 75 s |
| Chefe | a cada 15 ondas | a cada 20 (a figurinha do chefe segue o modo) |
| Modificadores de onda | a cada 5 ondas | só a partir da onda 20 |
| Vida do castelo | 1500 | 2250, e recupera o dobro entre as ondas |
| Recursos no começo | 200 de madeira e 110 de pedra (desde 2026-11-09) | 375 de madeira e 225 de pedra (o 1,5× de antes, mantido) |
| Fome | o trabalho cai pela metade | o trabalho cai só 25% |

### Equilíbrio (6 sementes)

| Modo | "Nada" (só o castelo atira) | Robô |
| --- | --- | --- |
| Normal | onda 4 | 23,2 |
| Fácil | onda 7,5 | 32,0 (4 das 6 sementes chegam ao teto de 40) |

Para rodar no fácil: `MODO=facil npm run balance`.

### Onde está

- **Simulação**:
  - `MODES` e `Mode` ficam em `config.ts`;
  - `createWorld(seed, R, mode)` aplica os recursos do começo, o castelo e a primeira calmaria;
  - `waveSize`, `waveInterval`, `modsForWave` e `waveSizeWithMods` recebem o modo;
  - a economia não gasta estoque e o fim da onda não repõe quando `depletes` é falso.
- **Telas**: `ModePick` em `App.tsx` desenha os dois botões; `readGameMode` em `game.ts` lê o modo guardado.

### O que falta

Ver o filho do usuário jogando o Fácil no tablet: se ainda está difícil, os números da tabela são o lugar de mexer.

### Ajustes depois da Etapa 18 (2026-11-07)

- **Fendas em qualquer lugar da borda** (pedido do usuário). Antes as três ficavam sempre ao norte (norte, nordeste e noroeste), em qualquer semente.
  - **O sorteio**: agora cada partida sorteia três pontos da borda pela semente, em qualquer combinação (uma ao norte e duas ao sul; leste, sul e oeste...). Elas só ficam a 50° ou mais uma da outra (`CONFIG.rifts`). A ordem do sorteio é a ordem em que abrem.
  - **O lado calmo**: a floresta e a rocha garantidas perto do castelo nascem no maior vão entre as fendas (`calmSide` em `world.ts`), e não mais sempre ao sul.
  - **Caminho garantido**: se a rocha ou um lago fecharem a passagem de uma fenda até o castelo, o mapa abre uma trilha reta de grama (`openRiftPaths`).
  - **Aviso**: diz de que lado a fenda nova abriu ("Uma nova fenda se abriu a sudeste.", `sideName` em `step.ts`).
  - **Salvo**: guarda as fendas (`rifts`). Um salvo de antes fica com as três do norte (`legacyRifts`).
  - **Desenho**: ao trocar de partida, os círculos das fendas antigas saem da cena. Antes ficavam, mas não se notava, porque caíam sempre no mesmo lugar.
  - **Robô (6 sementes)**: normal 23,5 (era 23,2), fácil 31,2 (era 32,0). "Nada" 4,3 e 7,5.
- **Continuar em destaque na tela de começo** (pedido do usuário: o botão pequeno induzia a começar outra partida).
  - Com partida salva, o Continuar é o botão grande da tela, com o triângulo de tocar, a onda e o modo da partida, e brilha devagar.
  - Começar outra virou um botão pequeno ("Começar outra partida"). Só depois de tocar nele aparece a escolha do modo, com o aviso de que a partida salva some e um Voltar.
  - As dicas de jogo ficam fechadas em "Como jogar".
  - Sem partida salva, a tela continua como antes: dicas e os dois botões de modo.

### Revisão das armas e dos golpes (2026-11-08)

O usuário pediu para revisar os golpes e as armas na mão. Cada personagem foi fotografado de perto (vista do jogo, de lado e de cima, com uma seta na frente do boneco), atacando, parado e andando. Correções:

| Quem | Problema | Correção |
| --- | --- | --- |
| Atiradora | a besta vem com a frente em +Z, e a mão do KayKit aponta a arma em +X no tiro de duas mãos: ela atirava para o lado direito | besta girada 90° em `loadArt`; parada, aponta para o chão |
| Cavaleiro Negro | o modelo é do rig grande, mas recebia as animações do rig médio: ficava agachado, com a espada pequena e o escudo escondido | entra em `LARGE`; golpe `Melee_1H_Slash` (`BIG_BY_KIND` em `chars.ts`); espada e escudo na versão `_Large` |
| Orc saqueador | todo branco: o `.glb` vem sem textura, que fica à parte no pacote | `orc_texture_A.png` aplicada ao carregar |
| Orc bruto | segurava o machado do orc saqueador, pequeno para ele | o `Orc_Axe_Large` do pacote dele, 30% maior (no tamanho do pacote sumia atrás dos braços no golpe) |
| Golem de ossos | atacava de mãos vazias | o `Skeleton_Golem_Axe_Large` do pacote Skeletons |
| Bruxa e Necromante | golpe de espada de mão vazia, e o necromante batia com o cajado como porrete | lançam magia (`MONSTER_ATTACK` em `world3d.ts`) |
| Lobisomem | golpe de espada de mão vazia | bate com as duas garras (`Melee_Dualwield_Attack_Chop`; o de corte girava o corpo e o deixava de costas) |
| Arqueiro (visto depois, 2026-11-08) | o arco vinha com a corda do lado de fora: ao mirar, a corda ficava virada para o inimigo | arco virado no eixo do comprimento em `loadArt` (vale para os arqueiros das torres) |

- **Ficou como estava**:
  - O Druida e o Mago seguram o cajado deitado para a frente quando estão parados. É o jeito do KayKit, e em pé o cajado do Druida some atrás dos chifres.
  - Os soldados e o Bárbaro fazem flexão com a arma na mão.
  - A besta da Atiradora parada encosta um pouco no chão.
- **Sem defeito**: Soldado, Arqueiro, Mago, Clérigo, Paladino, Engenheiro, Bárbaro, Esqueleto, Troll e Golem de gelo.

## 22. Evolução visual (Etapa 19)

Pedido do usuário (2026-11-08): o castelo e as tropas mudam de aparência conforme o jogador melhora o castelo e as tropas. Tudo com os modelos do KayKit da coleção local. Sem estrelas em cima da cabeça: o jogo também é para crianças, mas não só para elas.

### Castelo (níveis 1 a 4)

O KayKit tem um castelo só (em quatro cores), e ele ocupa o hexágono inteiro: muralhinha e torrezinhas em volta somem atrás dele. Então a evolução é no próprio castelo:

| Nível | Tamanho | Bandeira do topo | O que muda |
| --- | --- | --- | --- |
| 1 | 86% | 1,1 | castelo de hoje, um pouco menor, para sobrar onde crescer |
| 2 | 96% | 1,3 | estandartes azuis dos dois lados da porta |
| 3 | 106% | 1,6 | maior |
| 4 | 114% | 2,0 | telhados dourados (`building_castle_yellow`) |

- **Na subida de nível**, o castelo cresce do tamanho antigo para o novo em 1,2 s, com um leve passo além (o mesmo jeito do broto da Etapa 17).
- **A queda do castelo** (Etapa 13) derruba o castelo do tamanho e do telhado em que ele estava.
- **A barra de vida** sobe e desce com o tamanho.
- Números em `CASTLE_SCALE` e `CASTLE_FLAG` (`world3d.ts`).

### Tropas (melhorias da forja)

| Melhoria | Nível | Quem | O que muda |
| --- | --- | --- | --- |
| Armaduras | 1 | cavaleiro | ganha o elmo (`Paladin_with_Helmet`); antes ele usava sempre o com elmo, agora começa sem |
| Armaduras | 2 | soldado | armadura prateada (`knight_texture_alt_A` do Adventurers) |
| Armaduras | 3 | soldado | armadura dourada: a prateada com os cinzas puxados para o ouro (`goldenArmor` em `assets.ts`); a espada e o escudo, que usam a mesma textura, douram junto |
| Flechas | 1 a 3 | arqueiros (e torres) | rastro atrás da flecha: curto e fraco no 1, azul no 2, dourado e mais longo no 3 |

- **A troca vale para quem já está em campo**, no quadro seguinte à melhoria.
- **A armadura** é uma troca de textura no material (um material por textura, guardado), sem modelo novo (`CharView.setSkin`). O cavaleiro troca de modelo (`cavaleiroElmo`), com a mesma escala, para o corpo não mudar de tamanho.
- **Ficou de fora a aljava a mais**: o arqueiro do KayKit já tem uma aljava nas costas, e a segunda parecia duas.
- **Também ficou de fora** trocar escudo e espada por nível (na distância do jogo quase não se nota) e as cores alternativas do arqueiro e do mago (trocam rosto e cabelo, parecem outra pessoa).

### Arte

- `building_castle_yellow` e `banner_blue_full` (Medieval Hexagon Pack);
- `Paladin` sem elmo, além do `Paladin_with_Helmet` (Mystery Monthly 4);
- `knight_texture_alt_A` (Adventurers 2.0).

### O que falta

Jogar no tablet e no iPhone.

### Nome e ícone (2026-11-09)

O usuário achou "Reino Sitiado" genérico demais. Das opções, escolheu **Hordas & Hortas**: o trocadilho junta as duas metades do jogo, plantar e aguentar a horda. Numa busca rápida, nenhum jogo usa esse nome. Hexaforte foi descartado porque já existe um tower defense hexagonal chamado HexaFortress.

- Para o ícone, havia três rascunhos: (A) o castelo dourado numa ilha dentro de um hexágono dourado, (B) o castelo azul com um portal de olhos atrás e (C) o portal, o castelo e uma horta de abóboras. O usuário ficou com o **A**.
- Ele foi fotografado com a arte do próprio jogo: o castelo do nível 4, os estandartes e a ilha de grama com terra embaixo, na câmera do jogo (yaw π/6, inclinação 0,82). O fundo é marrom-escuro, com o hexágono na cor `--gold`.
- A cena que monta o ícone fica fora do projeto, porque o ícone muda pouco. Para refazer, monte de novo a cena num módulo carregado na página do jogo e fotografe pelo `/__snap`. Depois corte os tamanhos com `sips -Z`.
- Os arquivos ficam em `public/icons/`: 16 e 32 (favicon), 180 (`apple-touch-icon.png`) e 192 e 512 (manifesto).
- O `public/manifest.webmanifest` dá o nome, o ícone e `display: standalone`: na tela inicial, o jogo abre sem a barra do navegador.
- No iPhone, o jogo salvo na tela inicial guarda a partida e o álbum à parte do Safari. Por isso, quem já jogava no Safari começa do zero ali.
- O nome entrou no título da aba, na tela de carregar, na tela de começo, no README, no `package.json` e no título deste arquivo.
- O endereço (`reino-sitiado-game`), o repositório, a pasta, este arquivo e as chaves `reino.*` do armazenamento ficam como estão. Assim, o link e os saves não mudam.

## 23. Rebalanceamento e teto da horda (2026-11-09)

O usuário contou que, no normal, até a onda 15 ou 20 era fácil demais e depois difícil demais. Com os recursos do começo já dava para erguer duas serrarias, a mina, a pedreira, duas plantações e os arqueiros que seguravam as ondas. Da onda 20 em diante, mesmo com flechas, armas e armaduras no nível 3, muitas torres com arqueiros, soldados, clérigos e um herói, a horda costumava invadir e matar aldeões. Ele também pediu que, jogando bem, desse para ter um reino que luta para sempre.

### O que o robô mostrou

Medido com uma sonda por onda, feita a partir do robô:
- Até a onda 14 não se perdia ninguém e o castelo nunca era atingido.
- Na onda 15, o golem de gelo era um paredão.
- Da onda 20 em diante, o exército parava em uns 67 (castelo no teto, forja no 3), enquanto a vida somada da horda crescia uns 15% por onda (8% de vida × quantidade em linha). Na onda 30, cada monstro tinha 9× a vida da onda 1. O reino sempre caía: crescimento sem fim contra um reino com teto.
- Os aldeões morriam no trabalho (plantação 28, serraria 25, pedreira 19, mina 17, em 6 sementes), mortos por orcs, esqueletos, trolls e brutos que escapavam das torres.

### O que mudou

| O quê | Antes | Agora |
| --- | --- | --- |
| Começo do normal (`MODES.normal`) | 250 de madeira, 150 de pedra; primeira onda em 120 s; fendas nas ondas 1, 10 e 20; 4 + 2,5 monstros por onda | 200 de madeira, 110 de pedra; primeira onda em 90 s; fendas nas ondas 1, 5 e 12; 5 + 3 por onda |
| Começo do fácil | — | igual ao de antes (375 de madeira, 225 de pedra, 120 s, fendas 1, 10 e 20, 4 + 2,5 por onda) |
| Vida dos monstros | +8% por onda, sem fim | +7,5% por onda até a 20, +5% depois |
| Quantidade | sem fim | depois da onda 20, +1,5 por onda |
| **Teto da horda** (`capFrom`) | não havia | da onda 30 em diante, vida, quantidade e mistura param; seguem os dois modificadores, os chefes e o sorteio |
| Chefes | vida no ritmo da horda (golem de ossos na 30: 32.600) | vida em linha, +7% da base por onda (golem de gelo na 15: 3.564; de ossos na 30: 10.605), parada no teto |
| Saída das fendas | o começo da onda saía quase de uma vez | +0,3 s entre um monstro e outro: a onda grande chega em fila |
| Forja | 3 níveis | 5 níveis; o 4 e o 5 pedem cristal (160 de ferro, 180 de ouro e 15 de cristal; 240, 300 e 30) |

- **Aldeões fogem sozinhos** (`CONFIG.flee`): monstro a menos de 6 m, o aldeão larga o trabalho e corre (35% mais rápido) para a casa pronta ou o castelo mais perto que não esteja a menos de 3 m do monstro. Escondido, some e não vira presa. Sai pela porta depois de 3 s sem monstro a menos de 8 m do abrigo e volta ao mesmo trabalho. A perda vira produção parada (uns 15% do tempo das ondas), não aldeão morto. O Recolher no castelo continua; ao liberar, quem tinha corrido para uma casa sai dela.
- **Aviso do teto:** ao vencer a onda 30, um aviso dourado diz que a horda chegou à força máxima e que quem aguentou até ali pode lutar para sempre.
- **Onda que não acabava:** o monstro perseguia gente parada num ladrilho onde ele não entra (soldado na porta do quartel). Ficava andando sem sair do lugar na beira, e o soldado não o atacava porque o bolsão estava fora do `reach`. Uma onda do golem chegou a 5 minutos. Agora quem está num ladrilho bloqueado e fora do alcance do golpe não vira presa, e o monstro segue o campo de fluxo e bate no prédio. Na sonda, nenhuma luta passou de 4 minutos.
- **Robô:** só fazia torres e arqueiros e chegava ao golem da onda 15 sem soldado. Agora o quartel e os soldados vêm antes da quarta torre.

### Resultado (robô novo, 12 sementes, até a onda 80)

| | Antes | Agora |
| --- | --- | --- |
| Normal | caía entre 15 e 30, média 24,0; da onda 20 em diante, de 1 a 6 aldeões perdidos por onda | média 32 (partidas no limite contam como 76 e 77); 2 das 12 aguentam até o limite do teste (onda 76 a 77, 150 min de jogo) com perdas que não crescem; aldeões perdidos por onda entre 0 e 1 |
| "Nada" (só o castelo) | onda 4,3 | onda 4,0 |
| Fácil (6 sementes, `npm run balance` até 50) | 32,0 | as 6 chegam à onda 50 |

- Quem derruba o robô são os chefes (ondas 15 e 30) e as ondas 20 a 29. Ele quase não usa soldados, catapulta e cavaleiros contra o golem, como uma pessoa faria.
- A onda 30 é a mais dura de todas: é o teto, tem o golem de ossos e é a primeira com dois modificadores. Passou dela, o jogo é aguentar.
- O começo segue folgado para o robô: lotar as torres de arqueiros basta até a onda 14. Se o usuário ainda achar o começo fácil, os próximos passos são o tiro do castelo no nível 1 e o preço da torre.

### Onde está

- `config.ts`: `CONFIG.waves` (`hpGrowth`, `hpGrowthLate`, `lateFrom`, `perWaveLate`, `spawnGap`, `bossGrowth`, `capFrom`), `CONFIG.flee`, `CONFIG.forge.cost` com 5 níveis e, em `MODES`, `start`, `first`, `riftOpens`, `base` e `perWave` por modo.
- `step.ts`: `monsterHpMul` (vida da onda, dos chefes e do teto), `waveSize` com o teto, `threatNear`, `startFlee` e `hideStep` (a fuga), e a presa que o monstro alcança.
- Testes: as ondas crescem mais devagar e param no teto, o aviso do teto, a fuga e a volta, liberar o recolhimento e o monstro que não empaca.

## 24. Inimigos novos, chefe de musgo, elfos e o Sábio (2026-11-09)

O usuário viu a folha de personagens do KayKit que o jogo ainda não usava e escolheu estes:
- Inimigos: o 4 (vampiro), o 1 (esqueleto guerreiro) e o 8 (acumulador).
- Chefe novo: o 9 (4GTN esquecido).
- O 15 (guia) e o 21 (elfo).

O esqueleto mago, que ataca de longe, fica para depois, a pedido dele. O guerreiro planta (o 16, que seria um aliado guardião das hortas nascido do celeiro) ficou de fora, também a pedido dele.

### Inimigos

| Monstro | Modelo | Desde | O que faz |
| --- | --- | --- | --- |
| Esqueleto guerreiro | Skeleton_Warrior, machado e escudo pequeno do Skeletons | onda 6 | 70 de vida; flecha pega 60% (`arrowResist`). Vem no lugar de parte dos esqueletos: 5% a mais por onda, até 35% deles. |
| Acumulador | Hoarder (mochila com baú) | onda 7 | 60 de vida, rápido, não briga e ninguém é presa dele. No primeiro prédio do caminho rouba 15 + 2 × onda (até 80) do recurso daquele prédio: serraria madeira, pedreira pedra, mina ferro, plantação/celeiro/casa comida, o resto ouro. Sem esse recurso, leva o que o reino tiver mais. Foge reto para a fenda de onde veio, com 14 s. Derrubado, devolve tudo (moedas e aviso verde); chegando à fenda, some com o roubo. Um por onda, dois da onda 19 em diante. Um balão com o desenho do que ele leva vai em cima da mochila. |
| Vampiro | Vampire, com a espada dele | onda 18 | Meio-chefe: 500 de vida, 40% do golpe vira vida para ele (em gente e em prédio). Chama dois morcegos a cada 9 s, até 3 vivos. Um por onda, dois da onda 28 em diante (o fácil também tem um, sem desconto). |
| Golem de musgo (chefe) | 4GTN_Forgotten, rig grande | onda 45 | 2600 de vida, recupera 2% por segundo e cura 15 a horda em 4 m a cada 3 s, a não ser que o fogo o pegue (magia, piche aceso, flecha em brasa). Os chefes agora se revezam: gelo (15), ossos (30), musgo (45), gelo (60)... |

- **Onda que não acabava (de antes):** o esqueleto levantado pelo necromante às vezes nascia dentro de rocha ou água e ficava preso andando contra a pedra. Agora ele nasce num ladrilho livre ao lado, ou, sem lugar livre, onde o necromante está.
- **Equilíbrio (robô, 12 sementes, até a onda 80):**
  - com os quatro inimigos, média 23,7 (antes deles, 32); só 1 partida aguenta até o limite do teste;
  - sem nenhum dos três, volta a 26,0 com a mesma régua até 40;
  - tirar um só não basta, porque eles somam: o acumulador e o esqueleto guerreiro deixam o reino mais fraco antes do golem da onda 15, onde metade das partidas do robô cai;
  - por isso o acumulador rouba menos e vem menos vezes, o guerreiro sobe mais devagar e o vampiro ficou com 500 de vida, 40% de roubo e 3 morcegos;
  - é o começo mais tenso que o usuário pediu. Se pesar no jogo dele, os botões são os números acima.

### Elfos no inverno

No inverno, entre as ondas, de 1 a 4 elfos (Helper_A e Helper_B, dos Helpers, de bengala doce na mão) passeiam de porta em porta pela vila e acenam ao chegar. Somem numa nuvenzinha quando a onda começa ou quando o inverno acaba. São só enfeite (`stepElves` em `world3d.ts`), não existem na simulação e saem nos gráficos leves.

### O Sábio (dicas em figuras)

- **Quem é:** um velhinho de barba e óculos (o Lorekeeper). O retrato `public/ui/sabio.png` foi fotografado do modelo.
- **Onde aparece:** no canto de baixo à esquerda, com um balão de figuras ligadas por setas e uma frase curta embaixo.
- **Como some:** tocar fecha; sozinho, some em 14 s.
- **Quando aparece:** uma dica por vez, e cada uma só uma vez por partida (marcada em `world.flags`, que vai no salvo), quando faz sentido. As dicas, em `src/game/guide.ts`:
  - olá (casa, gente, trabalho);
  - torre com arqueiros;
  - pouca comida;
  - casas cheias;
  - a fuga dos aldeões;
  - recurso que acabou;
  - plantação colhida;
  - o acumulador;
  - a forja;
  - o herói;
  - chefe na próxima;
  - o vampiro.
- **Para desligar:** no ⋯, em "Dicas do Sábio" (`reino.guia` no navegador).

### Tropas novas: lanceiro espartano e anão de espingarda

O usuário pediu tropas novas para o castelo, "algo estilo um cavaleiro espartano com lança" e "anões com armas de fogo rústicas". O rascunho está em `reports/tropas-novas-rascunho.png` (fora do git), e ele escolheu o anão ruivo.

| Tropa | Prédio | Modelo | Números | O que faz |
| --- | --- | --- | --- | --- |
| Lanceiro | Acampamento (a tenda azul do Medieval): 60 de madeira, 30 de pedra e 10 de ferro | Knight do Adventurers, sem viseira, com a armadura recolorida para bronze a partir da textura dele (a capa fica vermelha), crista vermelha feita no código, `spear_A` do Fantasy Weapons e o escudo redondo | 110 de vida, dano 13 a cada 1,2 s, alcance 1,5 m. Custa 25 de comida, 10 de madeira e 15 de ferro | A lança alcança por trás dos soldados e dá 1,6× nos grandes (`CONFIG.spear`): orc bruto, troll, vampiro e os três golens. Estocada (`Melee_1H_Attack_Stab`); parado, faz flexões como o soldado. |
| Anão | Torre de pólvora (a torre de canhão do Medieval), castelo nível 2: 60 de pedra, 30 de madeira e 30 de ferro | Engineer do Adventurers sem os óculos, 12% mais largo e 10% mais baixo, com o elmo de chifres do Medieval (`units/neutral/helmet`, 5,6×) e a `shotgun` do Adventurers | 80 de vida, dano 28 a cada 2,6 s, alcance 6 m. Custa 20 de comida, 20 de ferro e 10 de ouro | Tiro de espingarda (dano `tiro`): pega também quem voa e o golem de gelo, e atravessa o escudo do esqueleto guerreiro e a armadura dos Blindados. Respinga 50% em quem estiver a 0,9 m do alvo (`CONFIG.gun`). Fumaça na boca do cano, faísca no alvo e um som novo (`tiro`). |

- A lança fica na mesma posição da espada do soldado. De cima ela aparece inteira, e a estocada leva a ponta no alvo. Em pé, de cima, ela quase sumia.
- O robô aprendeu a usar os dois: o Acampamento a partir da onda 5 (até 8 lanceiros) e a Torre de pólvora a partir da onda 9 com o castelo nível 2 (até 8 anões), antes da quarta torre. A média ficou em 20,2 (12 sementes).
  - Nas partidas em que ele cai na onda 15, ele chega só com arqueiros e o castelo no nível 1: gasta tudo em torres, e o acumulador leva um pouco.
  - Isso é limite do robô, não das tropas. Contra o golem, o jogador tem catapulta, soldados, lanceiros e agora os anões.

### Mapa maior e duas fendas (2026-11-09)

Decidido com o usuário depois da conversa sobre mapa e fendas:
- **Mapa:** raio 22 na partida nova com os gráficos normais (1.519 hexágonos, quase o dobro de antes), e 16 com os gráficos leves, por causa do tablet de entrada (`CONFIG.mapRadius` e `mapRadiusLight`; a escolha é feita em `Game` ao criar a partida). Florestas, rochas e veios acompanham a área, e a quantidade e a renovação ficam como estavam (o usuário achou boas). Cada salvo segue com o raio dele. No ⋯, os gráficos dizem "mapa maior" e "mapa menor", que vale para a próxima partida. A sombra do sol cobre o raio da partida aberta. Em 12 mapas de raio 22, nenhum modelo parado (árvores, rochas) passou de 85% do que dá para desenhar.
- **Fendas:** duas em vez de três (`CONFIG.rifts.count`). A segunda abre na onda 5 no normal e na 10 no fácil. Um salvo antigo com três fica com as duas primeiras, e a terceira vira grama.
- **Robô (12 sementes, até a onda 80):**
  - raio 22 com duas fendas: média 22,6, quedas na 15 e na 30 e nenhuma partida até o limite;
  - raio 16 com duas fendas: 17,9;
  - antes, raio 16 com três fendas e o mesmo conteúdo: 20,2.
  - Com menos fendas a horda chega mais concentrada num lado. No mapa grande ela anda mais até o castelo, e isso ajuda.
  - A onda 30 é o muro: é o teto, traz o golem de ossos e é a primeira com dois modificadores. Nenhum robô passou dela. Se o usuário também não passar, o próximo ajuste é ali.

### Socorro das tropas e o portão (2026-11-09)

O usuário notou que às vezes alguns soldados ficavam parados com ataque acontecendo. Havia quatro motivos:
1. Cada tropa defendia só um raio em volta do posto: 11 m, 15 m no cavaleiro.
2. Com ordem do jogador, só 5 m.
3. Soldado não atravessa muralha (`reach`).
4. Sem caminho até o monstro, a tropa ficava tentando o mesmo alvo para sempre.

O que mudou:
- **Socorro (`CONFIG.help`):** tropa sem ordem do jogador (soldado, cavaleiro, lanceiro, anão, mago, arqueiro sem torre e os heróis), sem monstro na área dela, vai até o monstro mais perto, a até 40 m, que esteja batendo em algo do reino ou a menos de 14 m do castelo. Acabou a ameaça, ela volta ao posto. Quem tem ordem do jogador continua segurando o ponto, porque foi escolha dele (`meleeTarget`, `helpTarget`, `rangedHelp` em `step.ts`).
- **Sem caminho:** o monstro fica de lado por 8 s (`skip`) e a tropa volta ao posto em vez de empacar (`chase`).
- **Portão:** quando a horda está perto de um posto mas fora do alcance a pé, e o reino tem muralha, o Sábio mostra "Soldados não atravessam muralha. Ponha um portão para eles saírem para a luta." (`w.flags.muralhaBloqueia`, dica `portao`).
- **Robô** (12 sementes, raio 22, até a onda 80): média 27,6 (antes do socorro, 22,6). Duas partidas passaram do muro da onda 30 e foram até a 60 e a 68. Morrem mais tropas por onda, porque elas saem mais para lutar. Em 12 partidas até a onda 60, nenhuma luta passou de 4 minutos.
- **Testes:** o soldado sem ordem ajuda e o com ordem fica; o anão vai até a briga; e a dica do portão com um anel de muralha fechado.

### Arte nova do piche e das estacas (2026-11-09)

O usuário pediu propostas melhores para as duas armadilhas. A folha das propostas está em `reports/armadilhas-propostas.png` (fora do git): quatro de piche e quatro de estacas. Ele escolheu o P2 e o E1.
- **Piche (P2):** poça grande e irregular com borda de terra escura, bolhas e dois arcos de brilho molhado, o caldeirão da bruxa (Mystery Monthly 5) na beira e a tocha acesa do Dungeon espetada do outro lado, que explica o "acender". O fogo do piche aceso continua o mesmo. O fosso agora faz sombra, por causa do caldeirão e da tocha. O giro continua pelo id.
- **Estacas (E1):** três fileiras de estacas de madeira (casca, ponta lascada clara e uma volta de corda), inclinadas para o lado de onde a horda vem. O giro sai do campo de fluxo (`trapAngle` em `world3d.ts`): a ponta aponta para fora, contra o caminho do castelo.
- **Onde está:** `pitchModel(art)` e `spikesModel()` em `world3d.ts`; o caldeirão e a tocha em `public/assets/kaykit/props/`.

### Horda sem fila indiana (2026-11-09)

O usuário notou que os inimigos andavam em fila organizada. Eram duas causas:
- Todo monstro mirava o centro exato do próximo ladrilho do campo de fluxo e seguia a mesma corrente de ladrilhos.
- Saíam da fenda um por um, em intervalos iguais.

O que mudou (`CONFIG.horde`):
- **Faixa própria:** cada monstro mira um ponto do próximo ladrilho deslocado até 0,75 m do centro, com direção e tamanho tirados do id (sem mexer no sorteio da partida), e balança devagar de lado (0,18 m). Ladrilho com muralha ou prédio continua mirado pelo centro, para o golpe sair igual (`laneOffset`).
- **Caminhos paralelos:** entre os vizinhos livres que chegam mais perto do castelo, cada monstro escolhe um pelo id e pelo ladrilho (`stepTile`). Todo passo desce no campo de fluxo, então ninguém se perde, e a horda vira uma faixa larga em vez de um fio.
- **Mais espaço:** os monstros se afastam dos vizinhos a menos de 0,62 m (era 0,5).
- **Bandos:** saem da fenda em bandos de 3 a 6 (o tamanho muda a cada onda), quase juntos e da mesma fenda. O intervalo entre bandos guarda o ritmo médio de antes. Os bandos se revezam entre as fendas abertas.
- **Não empacar:** a faixa própria às vezes mirava do outro lado da quina de uma rocha, e o monstro ficava andando sem sair do lugar. A onda não acabava. Agora quem fica 0,8 s quase parado volta ao meio do ladrilho e anda uns 5 s pelo meio do caminho.
- **Custo:** com 95 monstros andando, 0,03 ms por passo da simulação.
- **Robô** (12 sementes, até a onda 80): média 25,8 (antes, 27,6). A horda espalhada é um pouco mais difícil de segurar só com torres juntas. Em 12 partidas até a onda 50, nenhuma luta passou de 4 minutos.
- Fotos de antes e depois em `reports/horda-antes.png` e `reports/horda-depois.png` (fora do git).

## 25. Melhorias de 2026-11-10

Pedidas depois da análise do jogo (arte, jogabilidade e modelos). O que ficou de fora da lista: setas na borda da tela para ataque fora da vista, testar no tablet e no iPhone, mapas diferentes, cor do reino, prévia da próxima onda em figuras, dois salvos e o esqueleto mago (adiado).

### Torre em três níveis

A torre era uma só, a vigia de madeira a 1,8×, e doze delas escondiam a vila e o castelo. Agora ela começa menor e cresce com o que o jogador investe; o nível também se lê de longe:

| Nível | Visual | Alcance | Flechas | Vida | Preço para subir |
| --- | --- | --- | --- | --- | --- |
| 1 | vigia de madeira a 1,4× | 10 m | ×1 | 300 | (construir: 60 de madeira, 20 de pedra) |
| 2 | torre de pedra de topo aberto (a base do KayKit), os arqueiros no alto | 11,5 m | ×1,25 | 500 | 40 de madeira, 80 de pedra |
| 3 | a mesma maior, com tochas no alto e estandartes na porta; flecha de fogo | 13 m | ×1,5 | 700 | 120 de pedra, 40 de ferro, 60 de ouro; castelo nível 2 |

A flecha de fogo faz o que a bênção Flechas em brasa faz: o troll e o golem de musgo param de se curar e o piche aceso pega fogo. O rastro dela é laranja. No menu da torre, Melhorar fica à direita do Chamar, com o nível no selo.

### Muralha: paliçada e pedra

A muralha sai paliçada de troncos (5 de madeira, 160 de vida, feita no código: duas fileiras de troncos de ponta lascada num barranco de terra, e o poste das quinas de quatro troncos). No menu dela, Pedra vira o trecho tocado em pedra (6 de pedra, 320 de vida, o modelo de antes) e Todas vira toda paliçada pronta, a começar pela mais perto do trecho tocado, até a pedra acabar. A pedra se conserta com pedra; a paliçada, com madeira. O salvo de antes (sem `fmt`) fica com a muralha de pedra.

### Mercado

Prédio novo da economia (60 de madeira, 20 de pedra, um só no reino), o mercado de toldo do KayKit, na rua como os prédios de tropa (a casa do bairro de 8 casas não vira mais mercado, para a criança não tocar num "mercado" e abrir o menu da casa). Comprar e Vender abrem cinco botões, um por recurso, com o lote no rótulo e o ouro no selo. Lote de 20 (cristal, 5); preço em ouro de cada um: comida e madeira 0,5, pedra 0,7, ferro 1,5, cristal 6. Vender rende a metade.

### Ondas com cara própria e o aviso do chefe

Das ondas 8, 13, 18... (no fácil, da 13) a onda vem de uma família só: Matilha (lobisomens e uns morcegos), Noite dos ossos (esqueletos, os de escudo, necromantes e o vampiro, se for a vez dele) ou Bando de orcs (orc, bruto e troll). A família é sorteada pela semente entre as que já apareceram, e a onda tem a mesma vida somada de uma onda comum (a Matilha, no máximo 1,6× os monstros). Avisos: um cartão grande com o ícone da família no meio da tela quando ela começa, o nome no relógio da onda e a linha no relatório, com o ícone.

O chefe ganhou só aviso, como pedido: a frase "Chefe nesta onda" quando a onda sai e, quando ele sai da fenda, a trompa grave com tambores além da frase de antes.

### Prédio ferido

O fogo dos prédios abaixo da metade da vida já existia. Agora a fumaça começa em 3/4 da vida, cinza clara; na metade vem o fogo e a fumaça fica mais escura; abaixo de 1/4 entra uma segunda chama e a fumaça fica preta e mais cheia. A coluna sobe uns 3 m e é levada pelo vento, para ver de longe onde a horda bate.

### Aldeões levam o trabalho

A cada 22 s de serviço (mais um pouco pelo id), um dos trabalhadores da serraria, da pedreira, da mina ou da plantação leva o que tirou: tora no ombro, saco nas costas, ou carrinho de mão com pedra ou minério. A madeira, a pedra, o ferro e o cristal vão ao castelo; a comida, ao celeiro mais perto. A entrega não tem balão em cima do castelo ou do celeiro (o usuário tirou: o aldeão carregando já mostra). Só um por prédio de cada vez, e só se o destino estiver a até 9 hexágonos; perto da horda, ninguém sai. A produção conta a viagem como serviço: o que muda é o que se vê (e que o aldeão na estrada pode precisar fugir).

O castelo cercado de casas não tinha caminho a pé até o hexágono dele, e nisso o Recolher também falhava: o aldeão ficava parado onde estava. Agora quem leva ou se recolhe vai até a porta, o próprio castelo ou o vizinho dele que tiver caminho (casa encostada também serve).

### Neve, dia e noite

No inverno a neve deixa as trilhas e os quintais da vila à vista, com a terra pisada mais escura e molhada. O dia dura 300 s de partida (a partida começa de manhã): fim de tarde alaranjado, noite de lua azulada (75% do escuro da Noite sem lua, que continua mais escura) e amanhecer rosado. À noite acendem as janelas das casas e dos prédios da vila, quatro no castelo, as tochas da torre de nível 3 e a do piche.

### Figurinhas novas e o Livro do Sábio

Doze figurinhas: Caça-vampiro, Pega-ladrão (recuperar o roubo do acumulador), os três golens, Lanceiro, Anão, Torre de fogo, Muralha de pedra (10 trechos), Mercador e Onda de uma cara só.

O Livro do Sábio fica no ⋯, embaixo do álbum. Um cartão por monstro com a figura dele (retratos feitos com a arte e as armas do próprio jogo, `reports/bestiary-harness.js`; o morcego é um quadro do sprite). Quem ainda não apareceu em nenhuma partida fica escuro e borrado, com "?". Tocar num visto abre a página: o que ele faz e o que funciona contra, em ícones grandes, com a frase embaixo. O que já foi visto fica no navegador (`reino.livro`), e o monstro novo brilha até abrir o livro.

### `step.ts` em partes

O passo da simulação tinha 1.900 linhas e foi separado sem mudar nada (o robô caiu nas mesmas ondas, semente por semente): `common.ts` (passo, avisos, distâncias, andar, monstro mais perto), `buildings.ts`, `economy.ts`, `people.ts` (empregos, recrutas, fuga e agora a entrega), `troops.ts`, `heroes.ts`, `combat.ts`, `waves.ts`, `horde.ts` e `defenses.ts`. O `step.ts` ficou só com a ordem do passo e reexporta o que os outros usavam.

### Texturas sem cópia

Cada arquivo do KayKit traz a sua cópia da imagem de cores, mesmo quando é a mesma: a paleta do pack medieval ia 52 vezes para a placa de vídeo, a dos recursos e a dos esqueletos 7 vezes cada, e assim por diante. Cada uma tem 1024×1024 e ocupa uns 5,6 MB lá (mesmo com o arquivo de 15 KB). Agora o carregamento da arte (`sharedTexture` em `assets.ts`) reconhece a imagem pelo nome, tamanho, ajustes e uma amostra dos pixels, e todos os modelos usam a primeira; a cópia é solta antes de subir. Medido na onda 19 da partida do robô:

| | Antes | Depois |
| --- | --- | --- |
| Texturas dos modelos na cena | 101 | 24 |
| Texturas de 1024×1024 na placa de vídeo | ~95 | 17 |
| Memória dessas texturas | ~530 MB | ~95 MB |

O visual não muda. O resto da conta da placa (134 itens) são as folhas de efeito do pixelfx, a sombra, os balões e, a maioria, a textura de 12×12 com a pose do esqueleto de cada boneco (minúscula). Ainda pesam: 1,1 milhão de triângulos (as árvores são a maior parte) e uns 330 desenhos por quadro.

### Visual novo (depois da análise do What the Sea Keeps 0.3)

O usuário mostrou o What the Sea Keeps 0.3 (ilha de hexágonos feita com o Claude, Meshy, Suno e GPT). A beleza dele vem quase toda da luz, da água e do chão, e isso dá para fazer no Three.js sem trocar a arte do KayKit:

- **Luz de cinema** (`render/grade.ts`, só nos gráficos normais): o ajuste de tom ACES do Three seguido de um acerto de cor (mais cor, claros quentes, sombras frias), tudo dentro do desenho de cada material, como o "CustomToneMapping" do Three. Os efeitos do pixelfx e os balões ficam fora dele, como eram. As bordas mais escuras já vinham da camada `.vignette`. A sombra do sol ficou mais macia.
- **Sombra de contato pintada** (`paintShade` em `ground.ts`): um escurinho macio no chão embaixo de cada prédio, árvore, rocha e veio, num mapa visto de cima de 1024 px, repintado só quando prédios ou terreno mudam.
- **Água nova** (`ground.ts`): raso turquesa e fundo azul, rede de luz correndo no fundo do raso, brilho na superfície, espuma presa à margem e ondinhas chegando nela.
- **Chão vivo** (`render/meadow.ts`): tufos de grama em leque e canteiros de flores de sete cores, balançando ao vento, fora de prédio, quintal, trilha, pátio do castelo e água. Seguem a estação: grama branca e baixa na neve, flores só na primavera e no verão (poucas no outono). No leve, um terço da grama.
- **Luzes da noite** (`render/lights.ts`), no lugar das bolinhas laranja soltas no ar (o usuário achou estranho no iPhone): as janelas das casas, do moinho, da serraria, da taverna, do mercado, da capela, da torre do mago, da forja e do castelo brilham à noite (umas 70% das casas acendem, sorteio fixo pela posição). A arte do KayKit pinta cada parte com uma faixa de uma paleta 8×4; o vidro é a faixa (6, 1) e a janela do castelo a (3, 0), que também é o ferro dos canhões, das pedras da catapulta e do carrinho: por isso só os modelos da lista ganham o material aceso. Postes de madeira com lanterna (o `post_lantern` do Halloween Bits, na coleção local) vão nos hexágonos livres encostados nas casas e nos prédios da vila (as trilhas da vila apertada têm um metro e pouco) e dois na porta do castelo, um a cada 3,4 m, no máximo 40; o vidro da lanterna (faixa 2, 3) e a chama das tochas acendem. No chão, uma poça de luz quente pintada (como a sombra de contato) embaixo de cada poste, das tochas da torre de nível 3, do piche, da porta do castelo e da frente das casas acesas. Nada disso é luz de verdade do motor: não pesa.
- `?visual=antigo` desliga tudo, para comparar; no console, `visual(false)` e `visual(true)`.
- **Gráficos em três níveis** (pedido do usuário depois de testar no iPhone): no ⋯, Baixo, Médio e Alto (`render/quality.ts`). Baixo é o antigo "leve" (resolução da tela, sem sombra nem antisserrilhado, sem bichinhos, sem a cor de cinema, 30% da grama, 30 quadros por segundo e o mapa de raio 16 na partida nova). Médio: 1,5× a resolução, sombra do sol em 1024 px, 60% da grama e 70% do que cai do céu, com a cor de cinema e o mapa grande. Alto é o antigo "normal" (tudo). Quem tinha "leve" guardado vai para o Baixo e quem tinha "normal", para o Alto; aparelho novo com pouca memória começa no Baixo, o resto no Alto.

A primeira versão usava pós-processamento de verdade (sombra de contato GTAO, bloom e acerto de cor numa passada à parte) e ficou pesada: o usuário sentiu no Mac. Medido em tela retina (2560×1600), ia de 12 para 60 ms por quadro (38 só com as passadas, sem a sombra de contato). Trocada pelas versões acima, que não fazem passada a mais: na mesma medida, uns 8,9 ms antes e 8,3 depois, dentro do ruído. Falta medir no iPhone e no tablet.

### Robô

O robô aprendeu a subir as torres (da onda 8, com pedra sobrando) e a usar o mercado (da onda 10: ouro sobrando vira ferro; comida, se faltar). `ROBO_NIVEIS=0` e `ROBO_MERCADO=0` desligam isso. 12 sementes, até a onda 60:

| Rodada | Média | Não caíram até a 60 |
| --- | --- | --- |
| Antes de hoje | 25,8 | 1 |
| Regras novas, robô antigo (sem níveis nem mercado) | 23,3 | 0 |
| Regras novas, robô novo | 41,4 | 6 |
| Robô novo, sem as ondas de uma família | 35,9 | 4 |
| Robô novo, sem as entregas | 32,3 | 4 |

As duas últimas mostram mais o sorteio do que a regra: tirar a família ou as entregas muda a ordem dos sorteios e as quedas mudam de lugar. O que pesa mesmo são as torres de pedra e de fogo: com elas, metade das partidas segura a horda depois do teto da onda 30, que é o que o usuário queria ("quem jogar bem luta para sempre"). Quem cai, cai na onda 15 (primeiro chefe) ou na 19 (vampiros).

## 26. Arquitetura

- `src/sim/`: simulação pura, 20 passos por segundo, sem DOM.
  - `hex.ts`: coordenadas axiais e conversão para o mundo; um hexágono tem 2 m de lado a lado.
  - `world.ts`: estado e geração do mapa.
  - `path.ts`: campo de fluxo da horda e caminho das pessoas.
  - `deposits.ts`: estoque de floresta, rocha, veio e plantação, o que acontece quando acaba e onde o recurso novo nasce (Etapa 17).
  - `step.ts`: a ordem de um passo (obras, economia, chegadas, recrutas, ondas, horda, tropas e defesas); cada parte no seu arquivo (seção 25, "`step.ts` em partes").
  - `commands.ts`: ordens do jogador, cada uma com o motivo de não poder.
- **Campo de fluxo:** Dijkstra a partir do castelo. Prédios e muralhas custam mais para atravessar (`breakCost`). Com o reino todo cercado, o caminho mais barato passa por uma muralha, e o monstro para e bate nela.
- **Gente do reino:** anda por busca em largura. Rocha e prédios bloqueiam; portão e fazenda deixam passar. Os soldados só lutam onde alcançam a pé (`reach`).
- `src/render/`:
  - `assets.ts`: carrega a arte; modelos parados viram geometria única para instanciar.
  - `ground.ts`: chão contínuo. Seis triângulos por hexágono, sem fresta; a cor de cada vértice mistura os terrenos vizinhos com ruído, então não se vê ladrilho. A borda do mapa ganha uma encosta de terra, e as linhas da grade são uma malha à parte.
  - `world3d.ts`: natureza, prédios e muralhas instanciados (refeitos quando `world.ver` muda); personagens com esqueleto; flechas e barras de vida instanciadas.
  - `camera.ts`: câmera isométrica com arrastar, pinça, roda e toque.
  - `season.ts`: estações (tom da grama e das copas, neve, sombras de nuvem) e o tempo que cai do céu (Etapa 16).
  - `quality.ts`: gráficos normais ou leves (o que cada um liga e desliga, e o palpite pelo aparelho).
  - `bubbles.ts`: balões de ícone no mundo (prédio sem recurso, recurso novo), desenhados em canvas (Etapa 17).
  - `village.ts`: a vila (casas, prédios de tropa e o mercado virados para a rua, ruas até o castelo, quintais, poço e taverna); o chão dela é pintado em `ground.ts`.
- `src/audio/`: `sound.ts` com os efeitos sonoros e `music.ts` com a música ambiente, tudo feito na hora pelo Web Audio.
- **Muralha:** cada trecho desenha meio muro (ou meia paliçada) até cada vizinho que também é muralha e um poste nas curvas e pontas. O portão segue a linha dos dois vizinhos opostos.
- `src/game/game.ts`: ritmo (pausa, 1×, 2×, 3×), modo de construir ou mover, seleção e avisos. `album.ts`: as figurinhas e o que guarda no navegador; `bestiary.ts`: o Livro do Sábio; `guide.ts`: as dicas do Sábio. No toque, o primeiro toque mostra o fantasma e o segundo confirma; no mouse, o clique confirma.
- `src/ui/App.tsx`: HUD, ⋯, botões flutuantes, avisos e telas de começo e fim. O menu do prédio e o leque do Construir ficam em `src/ui/Radial.tsx` (seções 14 e 15).

## 27. Etapas

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
| 13 | Queda do castelo antes do diálogo de derrota (seção 16) | Pronta em 2026-11-07. Vista no navegador do Mac (tremor, meio da queda e fim); falta jogar no iPhone e ouvir o estrondo. |
| 14 | Heróis: Bárbaro, Atiradora, Druida e Cavaleiro Negro, comprados no castelo (seção 17) | Pronta em 2026-11-07. Vista no navegador do Mac (compra, giro, os quatro modelos, submenu); falta jogar no iPhone. |
| 15 | Fazenda com celeiro: plantações hexagonais em volta, uma planta por plantação (seção 18) | Pronta em 2026-11-07. Vista no navegador do Mac; falta jogar no iPhone. |
| 16 | Festa da vitória, mundo vivo, estações com tempo, música ambiente e álbum de figurinhas (seção 19) | Pronta em 2026-11-07, na `main`. Vista no navegador do Mac (festa, as quatro estações, chuva, figurinha, álbum no computador e no celular); a música foi conferida por medição, falta ouvir e jogar no iPhone. |
| 17 | Recursos que acabam e reaparecem longe do castelo, dos portais e das construções; plantação que acaba e se replanta (seção 20) | Pronta em 2026-11-07, na `main`. Vista no navegador do Mac (degraus da floresta e da rocha, toras, cascalho, balões, broto, Replantar no menu); falta jogar no tablet e no iPhone. |
| 18 | Modo fácil: nada acaba, ondas e mudança mais leves, castelo mais forte; escolhido com figura ao começar (seção 21) | Pronta em 2026-11-07, na `main`. Vista no navegador do Mac (primeira tela no tamanho de celular, Nova partida no ⋯, menu da plantação no fácil); falta jogar no tablet. |
| 19 | Evolução visual: castelo cresce e doura por nível; elmo, armadura prateada e dourada e rastro das flechas pelas melhorias da forja (seção 22) | Pronta em 2026-11-08. Vista no navegador do Mac (os quatro castelos, a subida de nível, as armaduras, o elmo e o rastro); falta jogar no tablet e no iPhone. |
| — | Nome Hordas & Hortas e ícone do castelo dourado no hexágono (seção 22, "Nome e ícone") | Pronto em 2026-11-09. Visto no navegador do Mac; falta ver na tela inicial do tablet e do iPhone. |
| — | Rebalanceamento: começo mais curto, horda que cresce mais devagar e para na onda 30, chefes em linha, forja até o 5, aldeões que fogem e o monstro que empacava (seção 23) | Pronto em 2026-11-09. Medido com o robô e visto no navegador do Mac (começo, fuga e volta, forja); falta jogar no tablet e no iPhone. |
| — | Inimigos novos (esqueleto guerreiro, acumulador, vampiro), chefe de musgo, elfos no inverno e o Sábio (seção 24) | Pronto em 2026-11-09. Visto no navegador do Mac (os quatro monstros, o balão do roubo, os morcegos do vampiro, os elfos na neve, o Sábio no computador e no celular); falta jogar no tablet e no iPhone. |
| — | Tropas novas: lanceiro espartano (Acampamento) e anão de espingarda (Torre de pólvora) (seção 24) | Pronto em 2026-11-09. Visto no navegador do Mac (bronze, crista, lança, elmo de chifres, os dois prédios e o tiro); falta jogar no tablet e no iPhone. |
| — | Mapa de raio 22 (16 nos gráficos leves) e duas fendas (seção 24) | Pronto em 2026-11-09. Visto no navegador do Mac (o mapa inteiro com as duas fendas); falta jogar no tablet e no iPhone. |
| — | Socorro das tropas sem ordem, tropa que não empaca sem caminho e a dica do portão (seção 24) | Pronto em 2026-11-09. Medido com o robô e nos testes; falta jogar no tablet e no iPhone. |
| — | Arte nova do piche (poça, caldeirão e tocha) e das estacas (três fileiras viradas para a horda) (seção 24) | Pronto em 2026-11-09. Visto no navegador do Mac (piche apagado e aceso, estacas no caminho da fenda); falta jogar no tablet e no iPhone. |
| — | Horda sem fila: faixa própria, caminhos paralelos, bandos e o monstro que não empaca na quina (seção 24) | Pronto em 2026-11-09. Visto no navegador do Mac (antes e depois na mesma onda); falta jogar no tablet e no iPhone. |
| — | Torre em três níveis, paliçada e muralha de pedra, mercado, ondas de uma família, aviso do chefe, prédio ferido com fumaça, aldeões levando o trabalho, neve sem cobrir as trilhas, dia e noite, figurinhas novas, Livro do Sábio e o `step.ts` em partes (seção 25) | Pronto em 2026-11-10. Medido com o robô e visto no navegador do Mac; falta jogar no tablet e no iPhone e ouvir a trompa. |

## 28. Arte e licenças

Tudo do KayKit (Kay Lousberg, CC0), copiado da coleção local por `npm run art` (lista em `tools/art-manifest.ts`). Detalhes em `LICENSES.md`.

| Pack | O que vem dele |
| --- | --- |
| Medieval Hexagon Pack | ladrilho, prédios, muralhas, natureza, flecha |
| Adventurers 2.0 | cavaleiro, arqueira, espada, escudo, arco |
| Skeletons | esqueleto, lâmina |
| Mystery Monthly | fazendeiros, lobisomem, orc saqueador e machado, orc bruto |
| Resource Bits | minério |
| RPG Tools Bits | pá, machado, picareta e martelo |
| Character Animations | todas as animações (Simulation, da Etapa 16: comemorar, acenar, sentar e flexões) |
| Heróis (Etapa 14) | Barbarian, Rogue_Hooded e Druid (Adventurers) com machado de duas mãos, besta e cajado; BlackKnight (Mystery Monthly 5) com espada e escudo grandes |
| Revisão das armas | machado grande do orc bruto, machado do golem de ossos e a textura do orc saqueador |
| Evolução visual (Etapa 19) | castelo de telhado dourado e estandarte (Medieval); Paladin sem elmo (Mystery Monthly 4); armadura prateada do Knight (Adventurers) |
| Ícone (2026-11-09) | castelo de telhado dourado e estandartes (Medieval), fotografados para o ícone |
| Inimigos novos (2026-11-09) | Skeleton_Warrior, Skeleton_Axe e Skeleton_Shield_Small_A (Skeletons); Vampire e a espada (Mystery Monthly 5); Hoarder e 4GTN_Forgotten (Mystery Monthly 6); Helper_A, Helper_B e a bengala doce (Mystery Monthly 5, Helpers); o retrato do Sábio sai do Lorekeeper (Mystery Monthly 6) |
| Tropas novas (2026-11-09) | tenda azul e torre de canhão, elmo de chifres (Medieval); spear_A (Fantasy Weapons); shotgun (Adventurers); o lanceiro é o Knight em bronze e o anão o Engineer |
| Melhorias de 2026-11-10 | torre de pedra (a base de torre) com tochas e estandartes, mercado de toldo, saco e carrinho de mão (Medieval); pedras e minério no carrinho (Resource Bits); retratos do Livro do Sábio feitos com os personagens do jogo; poste com lanterna das ruas (Halloween Bits) |

Os efeitos vêm do pixelfx (MIT); detalhes na seção 6 e em `LICENSES.md`.
