var documents = [];

function tokenize(text) {
  return text.toLowerCase().match(/[\w가-힣]+/g) || [];
}



function computeTF(documentTokens, token) {
  let count = 0;
  for (let word of documentTokens) {
    if (token === word) {
      count++;
    }
  }
  return count / documentTokens.length;
}

function computeIDF(documents, token) {
  let count = 0;
  for (let documentTokens of documents) {
    if (documentTokens.includes(token)) {
      count++;
    }
  }
  if (count === 0) return 0;
  return Math.log(documents.length / count);
}

function computeTFIDF(documentTokens, documents) {
  let tfidfValues = {};
  let uniqueTokens = new Set(documentTokens);

  for (let token of uniqueTokens) {
    let tf = computeTF(documentTokens, token);
    let idf = computeIDF(documents, token);
    tfidfValues[token] = tf * idf;
  }
  let sortedTfidf = Object.entries(tfidfValues).sort((a, b) => b[1] - a[1]);

  return sortedTfidf;

}

async function clickElementsSequentially() {

  var elements = [...document.querySelectorAll('.css-10n6ggo')];
  if(elements.length == 0) {
    elements = [...document.querySelectorAll('.css-zz1tso')];
  }
  documents = [];
  for (const element of elements) {
    element.click();
    console.log("대기 중...");
    var elements2, elements3;
    while (true) {
      await sleep2(1);
      elements3 = document.querySelectorAll('.css-1yvapiu');
      elements2 = document.querySelectorAll('.common-content-view-viewer');
      if (elements2.length == 0 || elements3.length == 0) continue;
      else break;
    }
    console.log(elements2[0].innerText);
    documents.push([...tokenize(elements3[0].innerText)]);

    // await waitForNavigationChrome(); // 페이지 로딩이 완료될 때까지 대기
  }

  console.log("모든 요소를 클릭했습니다.");
  let tfidf = computeTFIDF(documents[0], documents);
  for (let docTokens of documents) {
    let tfidf = computeTFIDF(docTokens, documents);
    console.log(tfidf);
  }
}

function sleep2(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

clickElementsSequentially();
