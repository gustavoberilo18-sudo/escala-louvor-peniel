# Escala de Louvor Peniel: versão 2

Escala mensal de vozes e instrumentos do Ministério de Louvor da IBN Peniel (Berilo/MG).
Qualquer pessoa com o link vê e edita, sem senha. Tudo fica salvo de forma permanente no próprio Netlify.

## O que tem nesta pasta

| Arquivo | Para que serve |
|---|---|
| `public/index.html` e `public/app.js` | A página da escala |
| `public/logo.png` e `public/icone.png` | Logo da igreja e ícone do app no celular |
| `public/vendor/jspdf.umd.min.js` | Gerador de PDF (fica junto, sem depender de outro site) |
| `public/vendor/fonts/` | Fontes Barlow Condensed usadas no PDF (licença livre OFL) |
| `netlify/functions/escala.mjs` | O "servidor" que guarda os dados (Netlify Blobs) |
| `netlify.toml` e `package.json` | Configuração do Netlify |
| `dev.mjs` | Só para testar no computador (opcional) |

## Como publicar no mesmo endereço (escalalouvorpeniel.netlify.app)

Não dá mais para só arrastar a pasta no Netlify Drop, porque o Drop não publica a parte que salva os dados.
Escolha **um** dos dois caminhos abaixo.

### Caminho A: pelo GitHub (sem instalar nada)

1. Crie uma conta gratuita em github.com, se ainda não tiver.
2. Clique em **New repository**, dê o nome `escala-louvor-peniel` e crie.
3. Na página do repositório, clique em **uploading an existing file** e arraste **todo o conteúdo desta pasta** (as pastas `public` e `netlify`, mais `netlify.toml`, `package.json` e os demais arquivos). Clique em **Commit changes**.
4. No Netlify, abra o site **escalalouvorpeniel** → **Site configuration** → **Build & deploy** → **Link repository** (ou "Link site to Git") → escolha GitHub e o repositório criado.
5. Confira as configurações e clique em **Deploy**:
   - Build command: deixe vazio
   - Publish directory: `public`
   - Functions directory: `netlify/functions`
6. Em 1 ou 2 minutos o endereço de sempre já abre a versão nova.

Daqui pra frente, qualquer arquivo atualizado no GitHub é publicado sozinho.

### Caminho B: pela linha de comando (precisa do Node.js instalado)

Abra o terminal dentro desta pasta e rode:

```
npm install
npx netlify-cli login
npx netlify-cli link        (escolha o site escalalouvorpeniel)
npx netlify-cli deploy --prod
```

## Primeiros passos depois de publicar

1. Abra o link e vá na aba **Integrantes**. Cadastre cada pessoa e marque as funções dela (Ministro, Backing, Teclado…). As funções decidem em quais vagas o nome aparece primeiro.
2. Se quiser, coloque o WhatsApp de cada pessoa. Assim o botão **WhatsApp → Avisar cada pessoa** abre direto na conversa dela, só com as datas dela.
3. Em **Não posso em…**, marque as datas em que a pessoa não pode servir.
4. Use **Preencher automático** para montar o mês, e depois ajuste à mão o que quiser.
5. Se a Santa Ceia mudar de domingo em algum mês, troque em **Santa Ceia**, ao lado do nome do mês. O domingo escolhido passa a ter culto de manhã e à noite, com o destaque vermelho, e quem já estava escalado acompanha a mudança.
6. Em **Escolher vagas** (acima dos cultos, ou em **Mais**), defina quantos backings vão ter (de nenhum a 4) e quais instrumentos entram na escala. Vale para aquele mês e para os seguintes, até alguém mudar de novo.
7. Precisa de uma escala fora da agenda normal (vigília, batismo, casamento, um segundo culto no mesmo dia)? Toque em **Escala extra**, acima dos cultos, escolha a data e dê um nome. Ela entra na tela, no PDF e no WhatsApp junto com os outros cultos, e o X do cartão exclui.
8. **Gerar PDF** baixa a escala do mês inteiro em uma folha A4 deitada, com um cartão por culto. A opção "As duas" gera duas folhas: uma de vozes e uma de instrumentos.

## Segurança dos dados

- Todo dia, na primeira alteração, o sistema guarda uma cópia de como os dados estavam. No botão de histórico (relógio, no topo) dá para voltar para qualquer uma dessas cópias.
- O mesmo painel mostra quem alterou o quê, de qual aparelho e quando, e tem o botão **Baixar dados (.json)** para guardar um backup no seu computador.
- Como não tem senha, qualquer pessoa com o link pode editar. Compartilhe o link só com a equipe.

## Testar no computador (opcional)

```
npm install
node dev.mjs
```

Depois abra http://localhost:8888.
