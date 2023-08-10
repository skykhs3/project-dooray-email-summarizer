
async function clickElementsSequentially() {
  const elements = [...document.querySelectorAll('.css-10n6ggo')];

  for (const element of elements) {
    element.click();
    console.log("대기 중...");
    var elements2;
    while (true) {
      await sleep2(1);
      elements2 = document.querySelectorAll('.common-content-view-viewer');
      if (elements2.length == 0) continue;
      else break;
    }
    console.log(elements2[0].innerText);

    // await waitForNavigationChrome(); // 페이지 로딩이 완료될 때까지 대기
  }

  console.log("모든 요소를 클릭했습니다.");
}

function sleep2(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

clickElementsSequentially();
