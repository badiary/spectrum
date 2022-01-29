"use strict";
import * as sat_modules from "./sat";
import { getSelection } from "../node_modules/rangy2/bundles/index.umd";
import Split from "../node_modules/split.js/dist/split";
import hotkeys from "../node_modules/hotkeys-js/dist/hotkeys";

let g_zumen_clicked = false;
let sat: sat_modules.Sat;
/*
 * ====================== ページ読み込み完了時の動作関連 ======================
 */

window.addEventListener("load", async () => {
  const tool_type = document.getElementById("tool_type")!.innerText;

  // content_root, content_window設定
  let content_root, content_window;
  if (tool_type === "pdf_canvas") {
    // // @ts-ignore
    // window.updateCommentContainer = updateCommentContainer;
    // @ts-ignore
    window.decoratePage = decoratePage;
    // // @ts-ignore
    // window.initPDFViewer = initPDFViewer;

    await new Promise((resolve, reject) => {
      const timer1 = setInterval(() => {
        if (
          document.querySelector("iframe")!.contentWindow!.document.body &&
          document.querySelector("iframe")!.contentWindow!.document.body
            .innerHTML !== ""
        ) {
          clearInterval(timer1);
          resolve(null);
        }
      }, 500);
    }).then(() => {
      content_window = document.querySelector("iframe")!.contentWindow!;
      content_root = content_window.document.getElementById("viewer")!;

      // comment_containerの高さをPDFの高さに合わせる
      // new ResizeSensor(content_root, () => {
      //   const ifr = document.querySelector("iframe")!.contentWindow!.document;
      //   const ifr_scroll_height =
      //     ifr.getElementById("toolbarViewer")!.scrollHeight +
      //     ifr.getElementById("viewerContainer")!.scrollHeight;
      //   const comment_svg = document.getElementById("comment_svg")!;
      //   const comment_div = document.getElementById("comment_div")!;
      //   comment_svg.style.height = `${ifr_scroll_height}px`;
      //   comment_div.style.height = `${ifr_scroll_height}px`;
      // });
    });
  } else {
    content_window = window;
    content_root = document.getElementById("content")!;
  }

  // スペクトルバー初期化
  const div_style = window.getComputedStyle(
    document.getElementById("spectrum")!
  );
  const cv = document.getElementById("spectrum_bar")! as HTMLCanvasElement;
  cv.width = Number(div_style.width.replace("px", ""));
  cv.height = Number(div_style.height.replace("px", ""));

  // オブジェクト、HTMLなど初期化
  const tmp = document.getElementById("selected_color")!.innerHTML;
  const selected_color: { [key: string]: string } = tmp ? JSON.parse(tmp) : {};
  sat = new sat_modules.Sat(
    tool_type,
    content_root as HTMLElement,
    content_window as Window,
    cv,
    selected_color,
    document.getElementById("comment_color")!.innerText,
    (document.getElementById("dark_mode")! as HTMLInputElement).checked,
    (document.getElementById("block_mode")! as HTMLInputElement).checked
  );

  initializeHTML();
  setKeyboardPreference();

  // 初期描画
  sat.word.setOption(getWordOption());
  sat.word.invert(sat.content_root);
  setColoredQuery();
  setTimeout(() => {
    sat.cv.updateData();
    sat.cv.draw();
    sat.comment.sort();
    sat.comment.arrange();
  }, 0);
});

/**
 * キーボード操作の挙動を定義
 */
function setKeyboardPreference() {
  // ショートカットキーを追加
  // @ts-ignore
  hotkeys.filter = (event: any) => {
    return true; // contenteditableな要素の中でもショートカットを有効にする
  };

  if (sat.tool_type === "free_text") {
    hotkeys("ctrl+b", (event: Event, _handler: any) => {
      event.preventDefault();
      decorate("bold");
    });
    hotkeys("ctrl+u", (event: Event, _handler: any) => {
      event.preventDefault();
      decorate("underline");
    });
  }

  hotkeys("ctrl+h", (event: Event, _handler: any) => {
    event.preventDefault();
    highlight();
    sat.content_window.getSelection()?.removeAllRanges();
  });
  hotkeys("ctrl+d", (event: Event, _handler: any) => {
    event.preventDefault();
    dehighlight();
    sat.content_window.getSelection()?.removeAllRanges();
  });
  hotkeys("ctrl+1", (event: Event, _handler: any) => {
    event.preventDefault();
    comment();
  });
  hotkeys("ctrl+s", (event: Event, _handler: any) => {
    event.preventDefault();
    if (sat.tool_type === "pdf_canvas") {
      // showSpinner("ダウンロードファイル生成中...", 150, downloadJSON);
    } else {
      showSpinner("ダウンロードファイル生成中...", 150, downloadHTML);
    }
  });
  hotkeys("ctrl+shift+f", (event: Event, _handler: any) => {
    event.preventDefault();
    function setCaretToEnd(target: HTMLElement) {
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(target);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
      target.focus();
      range.detach();
    }
    const div = document.getElementById("word_query")!;
    div.click();
    setCaretToEnd(div);
  });

  // backspaceでページが戻ることを防止＆コメント部分の削除処理等を定義
  // 以下のコードを参考に作成
  // https://stackoverflow.com/questions/1495219/how-can-i-prevent-the-backspace-key-from-navigating-back
  document.addEventListener("keydown", (e) => {
    if (!(e instanceof KeyboardEvent)) return;
    if (e.keyCode === 8) {
      let doPrevent = true;
      const d = e.target as HTMLElement;

      if (d.id === "word_query") {
        doPrevent = false;
      } else if (d.isContentEditable) {
        doPrevent = false;

        const div_element = window
          .getSelection()
          ?.anchorNode?.parentElement?.closest("div.comment") as HTMLElement;

        // コメントが空のときにBackspaceが押されたら、コメントを削除
        if (
          div_element &&
          (div_element.innerText === "\n" || div_element.innerText === "")
        ) {
          doPrevent = true;
          sat.updated = true;

          sat.comment.remove(div_element.getAttribute("comment_id")!);
          sat.cv.updateData();
          sat.cv.draw();
          sat.comment.sort();
          sat.comment.arrange();
        }
      } else if (d.tagName === "INPUT") {
        doPrevent = false;
      } else if (d.tagName === "TEXTAREA") {
        doPrevent = false;
      }

      if (doPrevent) {
        e.preventDefault();
        return;
      }
    } else if (e.keyCode === 112) {
      toggleZumenColumn();
      e.preventDefault();
    }
  });
}

/**
 * イベントハンドラの設定など
 */
async function initializeHTML() {
  document.addEventListener("click", (e) => {
    if (!(e.target instanceof HTMLElement)) return;
    const color_picker = document.getElementById("color_picker")!;
    if (
      color_picker.style.display !== "none" &&
      !color_picker.contains(e.target)
    ) {
      color_picker.style.display = "none";
    }
    const color_picker_comment = document.getElementById(
      "color_picker_comment"
    )!;
    if (
      color_picker_comment.style.display !== "none" &&
      !color_picker_comment.contains(e.target)
    ) {
      color_picker_comment.style.display = "none";
    }
    const help_box = document.getElementById("help")!;
    if (help_box.style.display !== "none" && !help_box.contains(e.target)) {
      help_box.style.display = "none";
    }
  });

  // イベントハンドラ追加（コメント側）
  Array.from(document.querySelectorAll("div.comment")).forEach(
    (div_element) => {
      div_element.addEventListener("mouseover", (e) => {
        sat.comment.onMouseOver(div_element.getAttribute("comment_id")!);
      });

      div_element.addEventListener("mouseout", (e) => {
        // 子要素への移動であれば無視
        if (
          e instanceof MouseEvent &&
          e.relatedTarget instanceof HTMLElement &&
          e.relatedTarget.parentElement !== null &&
          e.relatedTarget.parentElement.closest(
            `div.comment[comment_id="${div_element.getAttribute(
              "comment_id"
            )}"]`
          ) !== null
        ) {
          return;
        }
        sat.comment.onMouseOut(div_element.getAttribute("comment_id")!);
      });
    }
  );
  Array.from(
    document.getElementById("comment_svg")!.querySelectorAll("polygon")
  ).forEach((polygon_element) => {
    polygon_element.addEventListener("click", (e) => {
      if (e.target instanceof SVGPolygonElement) {
        sat.comment.onPolygonClick(e.target.getAttribute("comment_id")!);
      }
    });
  });

  // イベントハンドラ追加（被コメント側）
  Array.from(sat.content_root.querySelectorAll("span.commented")).forEach(
    (span_element) => {
      span_element.addEventListener("mouseover", (e) => {
        sat.comment.onMouseOver(span_element.getAttribute("comment_id")!);
      });

      span_element.addEventListener("mouseout", (e) => {
        // 子要素への移動であれば無視
        if (
          e instanceof MouseEvent &&
          e.relatedTarget instanceof HTMLElement &&
          e.relatedTarget.parentElement !== null &&
          e.relatedTarget.parentElement.closest(
            `span.commented[comment_id="${span_element.getAttribute(
              "comment_id"
            )}"]`
          ) !== null
        ) {
          return;
        }
        sat.comment.onMouseOut(span_element.getAttribute("comment_id")!);
      });
    }
  );

  // スペクトルバー関連
  if (sat.tool_type === "pdf_canvas") {
    sat.content_root.parentElement!.addEventListener("scroll", (e: any) => {
      sat.cv.draw();
      const comment_container = document.getElementById("comment_container")!;
      comment_container.scrollTo(
        0,
        e.target.scrollTop *
          (comment_container.scrollHeight / e.target.scrollHeight)
      );
    });
  } else {
    document.getElementById("main")!.addEventListener("scroll", (e) => {
      sat.cv.draw();
    });
  }

  window.addEventListener("resize", (_e) => {
    setTimeout(() => {
      const div_style = window.getComputedStyle(
        document.getElementById("spectrum")!
      );
      const cv = document.getElementById("spectrum_bar")! as HTMLCanvasElement;
      cv.width = Number(div_style.width.replace("px", ""));
      cv.height = Number(div_style.height.replace("px", ""));

      // 何故か、sat.cv.updateData();を先にしないとsat.comment.sort()とarrange()が機能しない。。。
      sat.cv.updateData();
      sat.cv.draw();
      sat.comment.sort();
      sat.comment.arrange();
    }, 0);
  });

  sat.cv.element.onclick = (e: any) => {
    if (sat.tool_type === "pdf_canvas") {
      sat.content_root.parentElement!.scrollTo(
        0,
        e.layerY *
          (sat.content_root.parentElement!.scrollHeight /
            sat.cv.element.height) -
          sat.cv.element.height / 2
      );
    } else {
      document
        .getElementById("main")!
        .scrollTo(
          0,
          e.layerY *
            (document.getElementById("main")!.scrollHeight /
              sat.cv.element.height) -
            sat.cv.element.height / 2
        );
    }
  };
  sat.cv.element.onmousedown = (e) => {
    sat.cv.element.onmousemove = (e: any) => {
      if (sat.tool_type === "pdf_canvas") {
        sat.content_root.parentElement!.scrollTo(
          0,
          e.layerY *
            (sat.content_root.parentElement!.scrollHeight /
              sat.cv.element.height) -
            sat.cv.element.height / 2
        );
        document
          .getElementById("comment_container")!
          .scrollTo(
            0,
            e.layerY *
              (document.getElementById("comment_container")!.scrollHeight /
                sat.cv.element.height) -
              sat.cv.element.height / 2
          );
      } else {
        document
          .getElementById("main")!
          .scrollTo(
            0,
            e.layerY *
              (document.getElementById("main")!.scrollHeight /
                sat.cv.element.height) -
              sat.cv.element.height / 2
          );
      }
    };
    sat.cv.element.onmouseup = () => {
      sat.cv.element.onmousemove = null;
      sat.cv.element.onmouseup = null;
    };
  };
  sat.cv.element.onmouseover = () => {
    sat.cv.element.onmousemove = null;
  };

  // ページ移動時のアラート
  window.addEventListener("beforeunload", (e) => {
    if (sat.updated) {
      e.returnValue =
        "編集内容が保存されていませんが、ページを離れてもよろしいですか？";
    }
  });

  // 上のメニューのイベントハンドラ
  document.getElementById("doc_title")!.addEventListener("input", (e) => {
    if (!(e.target instanceof HTMLInputElement)) return;
    if (e.target.value !== "") {
      document.title = e.target.value;
    } else {
      if (sat.tool_type === "free_text") {
        document.title = "SAT（フリーテキスト版）";
      } else if (sat.tool_type === "pdf_canvas") {
        document.title = "SAT（PDF版）";
      } else if (sat.tool_type === "pdf_svg") {
        document.title = "SAT（PDF版）";
      } else {
        document.title = "SAT (Spectrum Annotation Tool)";
      }
    }
  });
  document.getElementById("block_mode")!.addEventListener("change", (e) => {
    showSpinner("ワード反転中...", 10, () => {
      if (e.target instanceof HTMLInputElement && e.target.checked) {
        sat.word.block_mode = true;
        sat.word.invert(sat.content_root);
        sat.cv.updateData();
        sat.cv.draw();
      } else {
        sat.word.block_mode = false;
        sat.word.invert(sat.content_root);
        sat.cv.updateData();
        sat.cv.draw();
      }
    });
  });
  document.getElementById("btn_bold")!.addEventListener("click", () => {
    decorate("bold");
  });
  document.getElementById("btn_underline")!.addEventListener("click", () => {
    decorate("underline");
  });
  document.getElementById("btn_highlight")!.addEventListener("click", () => {
    highlight();
    sat.content_window.getSelection()?.removeAllRanges();
  });
  document
    .getElementById("btn_select_highlight_color")!
    .addEventListener("click", (e) => {
      if (!(e.target instanceof HTMLElement)) return;
      const color_picker = document.getElementById("color_picker")!;
      color_picker.setAttribute("mode", "highlight");
      color_picker.style.display = "block";
      color_picker.style.left = `${
        sat.getOffset(e.target, document.body).offset_left +
        e.target.offsetWidth / 2 -
        document.getElementById("color_picker")!.offsetWidth / 2
      }px`;
      e.preventDefault();
      e.stopPropagation();
    });
  document
    .getElementById("btn_select_comment_color")!
    .addEventListener("click", (e) => {
      if (!(e.target instanceof HTMLElement)) return;
      const color_picker = document.getElementById("color_picker")!;
      color_picker.setAttribute("mode", "comment");
      color_picker.style.display = "block";
      color_picker.style.left = `${
        sat.getOffset(e.target, document.body).offset_left +
        e.target.offsetWidth / 2 -
        document.getElementById("color_picker")!.offsetWidth / 2
      }px`;
      e.preventDefault();
      e.stopPropagation();
    });
  document.getElementById("btn_erase")!.addEventListener("click", (e) => {
    dehighlight();
    sat.content_window.getSelection()?.removeAllRanges();
  });
  document.getElementById("btn_comment")!.addEventListener("click", () => {
    comment();
  });
  document.getElementById("btn_download")!.addEventListener("click", () => {
    showSpinner("ダウンロードファイル生成中...", 150, downloadHTML);
  });
  document.getElementById("btn_figureOn")!.addEventListener("click", () => {
    toggleZumenColumn();
    document.getElementById("li_figureOn")!.classList.add("hidden");
    document.getElementById("li_figureOff")!.classList.remove("hidden");
  });
  document.getElementById("btn_figureOff")!.addEventListener("click", () => {
    toggleZumenColumn();
    document.getElementById("li_figureOff")!.classList.add("hidden");
    document.getElementById("li_figureOn")!.classList.remove("hidden");
  });
  document.getElementById("btn_editUnlock")!.addEventListener("click", () => {
    document.getElementById("content")!.contentEditable = "true";
    document.getElementById("li_editUnlock")!.classList.add("hidden");
    document.getElementById("li_editLock")!.classList.remove("hidden");
  });
  document.getElementById("btn_editLock")!.addEventListener("click", () => {
    document.getElementById("content")!.contentEditable = "false";
    document.getElementById("li_editLock")!.classList.add("hidden");
    document.getElementById("li_editUnlock")!.classList.remove("hidden");
  });
  document.getElementById("word_query")!.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      showSpinner("ワード反転中...", 0, () => {
        sat.word.setOption(getWordOption());
        sat.word.invert(sat.content_root);
        setColoredQuery();
        sat.cv.updateData();
        sat.cv.draw();

        document.getElementById("word_query")!.blur();

        sat.updated = true;
      });
    }
  });
  document
    .getElementById("btn_word_inversion_help")!
    .addEventListener("click", (e) => {
      if (!(e.target instanceof HTMLElement)) return;
      const help_box = document.getElementById("help")!;
      if (help_box.style.display === "block") {
        help_box.style.display = "none";
      } else {
        help_box.style.display = "block";
        help_box.innerHTML = `
            <h3>ワード反転方法</h3>
            <p> （入力例）<img src="./img/word_inversion_example.png" style="vertical-align: middle";/></p>
            <ul>
              <li>
                反転したいワードを、スペースで区切って入力した後、Enterキーを押してください。
              </li>
              <li>＋で繋いだワードは同じ色に反転されます。</li>
              <li>
                _（アンダーバー）は、色反転時に半角スペースとして変換されます。英語の複数語をまとめて色反転したい場合にご使用ください。<br />
              </li>
              <li>
                /でワードを囲むと、正規表現として認識されます。（例：/請求項[0-9０-９]+/）<br />
                末尾のオプションは省略可能です。（自動でgオプションがつきます）
              </li>
  
              <li>
                ワード反転後、ボックス中のワードをクリックすると、反転色を変更できます。
              </li>
              <li>
                ブロック反転にチェックを入れると、漢字・カタカナ・英数字を含めたブロック単位で反転を行います。
              </li>
            </ul>`;
        help_box.style.left = `${
          sat.getOffset(e.target, document.body).offset_left +
          e.target.offsetWidth / 2 -
          document.getElementById("help")!.offsetWidth / 2
        }px`;
        e.preventDefault();
        e.stopPropagation();
      }
    });
  document.getElementById("btn_marker_help")!.addEventListener("click", (e) => {
    if (!(e.target instanceof HTMLElement)) return;
    const help_box = document.getElementById("help")!;
    if (help_box.style.display === "block") {
      help_box.style.display = "none";
    } else {
      help_box.style.display = "block";
      help_box.innerHTML = `
          <h3>本文の装飾方法</h3>
          <p> マーカーなどの装飾を行いたい箇所をドラッグして選択した後に、ボタンを押してください。</p>
          <p> コメントボタンで挿入したコメントを削除したい場合は、右側のコメントボックス内の文字を全て削除して空にした状態で、さらにBackspaceキーを押してください。</p>
          <p> 挿入したコメントの吹き出しの三角形をクリックすると、コメントの色を変えることができます。</p>
          <p> マーカーを削除したい場合は、<b>同じ色で</b>削除したい部分をマークするか、ハイライト削除ボタンを使用してください。</p>`;
      help_box.style.left = `${
        sat.getOffset(e.target, document.body).offset_left +
        e.target.offsetWidth / 2 -
        document.getElementById("help")!.offsetWidth / 2
      }px`;
      e.preventDefault();
      e.stopPropagation();
    }
  });

  document.getElementById("dark_mode")!.addEventListener("change", (e) => {
    if (!(e.target instanceof HTMLInputElement)) return;
    if (e.target.checked) {
      document.body.classList.add("dark");
      sat.dark_mode = true;
      if (sat.comment.background_color === "#ffcccc") {
        sat.comment.background_color = "#cc3300";
        document.getElementById("btn_comment")!.style.backgroundColor =
          "#cc3300";

        document.getElementById("comment_color")!.innerText = "#cc3300";
      }
    } else {
      document.body.classList.remove("dark");
      sat.dark_mode = false;
      if (sat.comment.background_color === "#cc3300") {
        sat.comment.background_color = "#ffcccc";
        document.getElementById("btn_comment")!.style.backgroundColor =
          "#ffcccc";
        document.getElementById("comment_color")!.innerText = "#ffcccc";
      }
    }

    if (sat.tool_type === "pdf_canvas") {
      if (e.target.checked) {
        sat.content_window.document.body.classList.add("dark");
      } else {
        sat.content_window.document.body.classList.remove("dark");
      }
    }

    sat.cv.updateData();
    sat.cv.draw();
  });

  // カラーピッカー関連
  document.getElementById("colormap")!.addEventListener("mouseout", (e) => {
    colorPickerMouseOut();
  });
  Array.from(
    document.getElementById("colormap")!.querySelectorAll("area")
  ).forEach((area) => {
    area.addEventListener("mouseover", (e) => {
      colorPickerMouseOver(area.alt);
    });
    area.addEventListener("click", (e) => {
      colorPickerClick(area.alt);
    });
  });

  // オブザーバ関係（サイズ変更の監視）
  const comment_removal_observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.removedNodes.forEach((node) => {
        if (node instanceof HTMLSpanElement) {
          if (node.classList.contains("commented")) {
            const comment_id = node.getAttribute("comment_id")!;
            const span_with_same_comment_id = document
              .getElementById("content")!
              .querySelector(`span.commented[comment_id="${comment_id}"]`);
            if (!span_with_same_comment_id) {
              sat.comment.remove(comment_id);
            }
            sat.cv.updateData();
            sat.cv.draw();
            sat.comment.sort();
            sat.comment.arrange();
          }
        }
      });
    });
  });
  comment_removal_observer.observe(document.getElementById("content")!, {
    childList: true,
    subtree: true,
  });

  const comment_resize_observer = new MutationObserver((mutations) => {
    sat.comment.arrange();
  });
  comment_resize_observer.observe(document.getElementById("comment_div")!, {
    attributes: true,
    childList: true,
    subtree: true,
    characterData: true,
    attributeFilter: ["offsetHeight", "clientHeight", "scrollHeight", "height"],
  });

  const body_resize_observer = new MutationObserver((mutations) => {
    sat.cv.updateData();
    sat.cv.draw();
    sat.comment.sort();
    sat.comment.arrange();
  });
  body_resize_observer.observe(document.body, {
    attributes: true,
    attributeFilter: [
      "offsetHeight",
      "clientHeight",
      "scrollHeight",
      "height",
      "offsetWidth",
      "clientWidth",
      "scrollWidth",
      "width",
    ],
  });

  const cv_resize_observer = new MutationObserver((mutations) => {
    sat.cv.updateData();
    sat.cv.draw();
    sat.comment.sort();
    sat.comment.arrange();
  });
  cv_resize_observer.observe(document.getElementById("spectrum")!, {
    attributes: true,
    attributeFilter: [
      "offsetHeight",
      "clientHeight",
      "scrollHeight",
      "height",
      "offsetWidth",
      "clientWidth",
      "scrollWidth",
      "width",
    ],
  });

  // 本文部分のイベントハンドラ登録
  document.getElementById("content")!.addEventListener("input", (e) => {
    sat.updated = true;
    sat.comment.arrange();
  });

  // 簡易ワード反転のクリックイベント（color_pickerのクリックイベント時にこのイベントの実行を中止させたいので、focusでなくclickイベントを選択）
  document.getElementById("word_query")!.addEventListener("click", (e) => {
    if (!(e.target instanceof HTMLElement)) return;
    e.target.querySelectorAll("span").forEach((span) => {
      span.className = "";
      span.onclick = null;
    });
  });

  // ワード設定ボックスへの貼り付け時に書式を消す
  document.getElementById("word_query")!.addEventListener("paste", (e: any) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertHTML", false, text);
  });

  if (sat.tool_type !== "pdf_canvas") {
    // flexboxをresizableに
    Split(["#content", "#comment_container"], {
      sizes: [70, 30],
      minSize: [50, 50],
      elementStyle: (
        _dimension: any,
        size: number,
        _gutterSize: any,
        _index: any
      ) => {
        return {
          width: `${size}%`,
        };
      },
      onDragEnd: (_sizes: any) => {
        // setTimeoutしないと、コメント位置が正しく設定されない（何故？）
        setTimeout(() => {
          sat.comment.arrange();
          sat.cv.updateData();
          sat.cv.draw();
        }, 0);
        sat.comment.arrange();
        sat.cv.updateData();
        sat.cv.draw();
      },
      gutterSize: 5,
    });
  }

  if (sat.tool_type === "tazumen") {
    // flexboxをresizableに
    Split(["div#zumen", "div#text"], {
      sizes: [30, 70],
      elementStyle: (
        _dimension: any,
        size: number,
        gutterSize: number,
        _index: any
      ) => {
        return {
          width: `calc(${size}% - ${gutterSize + 20}px)`,
        };
      },
      onDragEnd: (_sizes: any) => {
        // setTimeoutしないと、コメント位置が正しく設定されない（何故？）
        setTimeout(() => {
          sat.comment.arrange();
          sat.cv.updateData();
          sat.cv.draw();
        }, 0);
        sat.comment.arrange();
        sat.cv.updateData();
        sat.cv.draw();
      },
      gutterSize: 4,
    });

    addZumenEventHandler();
  }

  if (
    sat.tool_type === "tazumen" &&
    document.getElementById("content")!.innerHTML === "tazumen_gyomu"
  ) {
    const modal = document.getElementById("paste_modal_window")!;
    modal.style.display = "block";

    const input = document.getElementById("paste_modal_input")!;
    input.focus();
    input.addEventListener("paste", (e) => {
      // @ts-ignore
      const paste_data = (e.clipboardData || window.clipboardData).getData(
        "text"
      );
      console.log(paste_data);
      modal.style.display = "none";
      e.preventDefault();
      setDataFromTazumenBrowser(JSON.parse(paste_data));
    });
  }

  // 多図面ブラウザ等からのデータの受信に関する処理
  window.addEventListener("message", (e) => {
    console.log(e);
    switch (e.data.message_type) {
      case "tazumen":
        if (e.origin === "http://npsx8.jpo.go.jp") {
          setDataFromTazumenBrowser(e.data);
        }
        break;

      case "free_text":
        sat.content_root.innerText = e.data.innerText;
        break;

      default:
        break;
    }
  });
}

/*
 * ====================== ダウンロード、ロード関連 ======================
 */

/**
 * HTMLファイルの保存（参考：https://blog.mudatobunka.org/entry/2015/12/23/211425）
 */
async function downloadHTML() {
  // テキストノードを整理
  sat.content_root.normalize();

  // 画像をbase64形式に変更
  Array.from(document.querySelectorAll("img")).forEach((img) => {
    if (img.src.substr(0, 11) !== "data:image/") {
      img.src = getDataUrl(img);
    }
  });

  // <html> を cloneし、色々と処理
  const html = document.querySelector("html")!.cloneNode(true) as HTMLElement;
  Array.from(html.querySelectorAll(".gutter")).forEach((gutter) => {
    gutter.remove();
  });
  html.querySelector("#spinner")!.classList.remove("visible");
  Array.from(html.querySelectorAll("script")).forEach((script) => {
    if (/log[^/]*\.js/.test(script.src)) {
      script.remove();
    }
  });
  html
    .querySelector("#doc_title")!
    .setAttribute(
      "value",
      (html.querySelector("#doc_title")! as HTMLInputElement).value
    );
  if ((html.querySelector("#dark_mode")! as HTMLInputElement).checked) {
    html.querySelector("#dark_mode")!.setAttribute("checked", "");
  }
  if ((html.querySelector("#block_mode")! as HTMLInputElement).checked) {
    html.querySelector("#block_mode")!.setAttribute("checked", "");
  }
  html.querySelector("#word_query")!.innerHTML =
    html.querySelector("#word_query")!.innerHTML;
  html.querySelector("#selected_color")!.innerHTML = JSON.stringify(
    sat.word.selected_color
  );

  // 外部CSS, JSファイルをダウンロードしてHTMLに埋め込む
  let promiseFactories = Array.from(html.querySelectorAll("link"))
    .filter((link) => {
      return link.rel === "stylesheet";
    })
    .map((link) => {
      return () =>
        new Promise((resolve, reject) => {
          fetch(link.href)
            .then((res) => {
              return res.text();
            })
            .then((text) => {
              link.remove();
              const style = document.createElement("style");
              style.innerHTML = text;
              html.querySelector("head")!.appendChild(style);
              resolve(null);
            });
        });
    });
  await executeSequentially(promiseFactories);

  promiseFactories = Array.from(html.querySelectorAll("script"))
    .filter((script) => {
      return script.src !== undefined && script.src !== "";
    })
    .map((script) => {
      return () =>
        new Promise((resolve, reject) => {
          if (script.src.indexOf("js-tazumen") === -1) {
            fetch(script.src)
              .then((res) => {
                return res.text();
              })
              .then((text) => {
                script.removeAttribute("src");
                script.innerHTML = text;
                resolve(null);
              });
          } else {
            resolve(null);
          }
        });
    });
  await executeSequentially(promiseFactories);

  const src = html.innerHTML;

  // 上記の src には DOCTYPE が含まれていないので別途用意
  const name = document.doctype!.name;
  const publicId = document.doctype!.publicId;
  const systemID = document.doctype!.systemId;
  const doctype =
    "<!DOCTYPE " +
    name +
    (publicId ? ' PUBLIC "' + publicId + '"' : "") +
    (systemID ? ' "' + systemID + '"' : "") +
    ">";

  // <html> タグを再構成
  let htmlTag = "<html";
  const attrs = html.attributes;
  for (let i = 0, n = attrs.length; i < n; i++) {
    const attr = attrs[i];
    htmlTag +=
      " " +
      attr!.nodeName +
      (attr!.nodeValue ? '="' + attr!.nodeValue + '"' : "");
  }
  htmlTag += ">";

  // ソースコードを Blob オブジェクトに変換してURLを取得
  const blob = new Blob([doctype, "\n", htmlTag, "\n", src, "\n</html>"]);
  const url = window.URL || window.webkitURL;
  const blobURL = url.createObjectURL(blob);

  // <a> を新たに作成し、ダウンロード用の設定をいろいろ
  const a = document.createElement("a");
  a.download = `${document.title}.html`;
  a.href = blobURL;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  sat.updated = false;
}

function executeSequentially(promiseFactories: any) {
  let result = Promise.resolve();
  promiseFactories.forEach((promiseFactory: any) => {
    result = result.then(promiseFactory);
  });
  return result;
}

/**
 * 画像のbase64形式での表現を取得
 * @param {object} img imgエレメントのオブジェクト
 */
function getDataUrl(img: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL("image/png");
}

/*
 * ====================== decoration, comment関連 ======================
 */

/**
 * 選択された領域の修飾
 * @param {string} class_name 修飾に対応するclassの名前
 */
function decorate(class_name: string) {
  const selection = sat.content_window.getSelection();
  if (!selection) return;
  // 選択範囲がsat.content_rootに含まれていなければ終了
  if (
    !sat.content_root.contains(selection.anchorNode) ||
    !sat.content_root.contains(selection.focusNode)
  ) {
    return;
  }
  sat.decoration.add(class_name);
  sat.updated = true;
}

/**
 * 選択された領域のハイライト
 */
function highlight() {
  const color = document
    .getElementById("btn_highlight")!
    .getAttribute("highlightColor")!;

  const selection = sat.content_window.getSelection();
  if (!selection) return;

  // 選択範囲がsat.content_rootに含まれていなければ終了
  if (
    !sat.content_root.contains(selection.anchorNode) ||
    !sat.content_root.contains(selection.focusNode)
  ) {
    return;
  }
  sat.decoration.highlight(color);
  sat.updated = true;
}

/**
 * 選択された領域のハイライト削除
 */
function dehighlight() {
  sat.decoration.dehighlight();
}

/**
 * 選択された領域へのコメントを追加
 */
function comment() {
  const selection = sat.content_window.getSelection();
  if (!selection) return;

  // 選択範囲がsat.content_rootに含まれていなければ終了
  if (
    !sat.content_root.contains(selection.anchorNode) ||
    !sat.content_root.contains(selection.focusNode)
  ) {
    return;
  }

  // Selectionにコメントが含まれている場合、コメントを追加しない
  const sel = getSelection(sat.content_window);
  if (sel.rangeCount) {
    if (
      sel.getRangeAt(0).getNodes([], (node: Node) => {
        return node instanceof Element && node.classList.contains("commented");
      }).length > 0
    ) {
      alert("同じ領域に複数のコメントをつけることはできません。");
      return;
    }
    if (
      sel
        .getRangeAt(0)
        .commonAncestorContainer.parentElement.closest("span.commented") !==
      null
    ) {
      alert("同じ領域に複数のコメントをつけることはできません。");
      return;
    }
  }

  sat.comment.addComment();

  sat.updated = true;
}

/*
 * ====================== ワード反転関連 ======================
 */

/**
 * #word_query内に入力されたクエリからワード反転のオプションを生成
 * @return {object} satオブジェクトに渡すワード反転のオプション
 */
function getWordOption() {
  const query = document
    .getElementById("word_query")!
    .innerText.trim()
    .replace(/[\r\n]+/g, " ");
  if (query === "" || /^\s+$/.test(query)) {
    return {};
  }

  const word_arr: string[][] = query.split(/\s+/).map((word) => {
    const slash_match = word.match(/(^\/|[^\\]\/|\/$)/g);
    if (slash_match && slash_match.length > 0 && slash_match.length % 2 === 0) {
      // クエリの最小単位を求める再帰関数（先頭から順に最小単位を切り取っていく）

      return getQueryUnitArr(word, []);
    } else {
      return word.split(/[+＋]/g);
    }
  });

  // 反転ワード情報を更新
  const colors = sat.word.getWordColors(word_arr.length);

  const word_option: { [color_id: string]: sat_modules.WordOption } = {};
  word_arr.forEach((words: string[], i: number) => {
    words.forEach((word: string) => {
      if (!word_option[i]) {
        word_option[i] = { words: [], color: "" };
      }
      if (word.substr(0, 1) !== "/") {
        word_option[i]!.words.push(word.replace(/_/g, " "));
      } else {
        word_option[i]!.words.push(word);
      }

      word_option[i]!.color = colors[i]!;
    });
  });

  return word_option;
}

function getQueryUnitArr(word: string, acc: string[]): string[] {
  if (word.substr(0, 1) !== "/") {
    // 先頭は正規表現でない -> 最先の+を見つけてそこで区切る
    const pos_plus = word.indexOf("+");
    if (pos_plus === -1) {
      acc.push(word);
      return acc;
    } else {
      acc.push(word.substring(0, pos_plus));
      return getQueryUnitArr(word.substring(pos_plus + 1), acc);
    }
  } else {
    // 先頭は正規表現 -> 最先の/（ただし\/は除外）を見つけてそこで区切る
    const mt = word.match(/[^\\]\/[dgimsuy]*/)!;
    if (!mt) return acc; // 何かがおかしい
    acc.push(word.substring(0, mt.index! + mt[0]!.length));

    if (word.length === mt.index! + mt[0]!.length) {
      return acc;
    } else {
      return getQueryUnitArr(
        word.substring(mt.index! + mt[0]!.length + 1),
        acc
      );
    }
  }
}

/**
 * #word_query内に、キーワードを各反転色で反転させたHTMLをセット
 */
function setColoredQuery() {
  const query_div = document.getElementById("word_query")!;
  query_div.innerHTML = "";

  Object.keys(sat.word.option).forEach((color_id) => {
    sat.word.option[color_id]!.words.forEach((word, j) => {
      const span = document.createElement("span");
      span.innerText = word.replace(/ /g, "_");
      span.setAttribute("mode", "word_inversion");
      span.setAttribute("color_id", color_id);
      span.classList.add("query_unit");
      span.classList.add(`word_inversion_class${color_id}`);
      span.onclick = (e) => {
        if (!(e.target instanceof HTMLElement)) return;
        const color_picker = document.getElementById("color_picker")!;
        color_picker.setAttribute(
          "color_id",
          e.target.getAttribute("color_id")!
        );
        color_picker.style.display = "block";
        color_picker.style.left = `${
          sat.getOffset(e.target, document.body).offset_left +
          e.target.offsetWidth / 2 -
          document.getElementById("color_picker")!.offsetWidth / 2
        }px`;
        color_picker.setAttribute("mode", "word_inversion");
        e.preventDefault();
        e.stopPropagation();
      };
      query_div.appendChild(span);
      if (j !== sat.word.option[color_id]!.words.length - 1) {
        query_div.appendChild(document.createTextNode("+"));
      }
    });
    query_div.appendChild(document.createTextNode(" "));
  });
}

/**
 * color pickerのマウスオーバーイベント
 * @param {string} color_code マウスオーバーされたカラーコード
 */
// @ts-ignore
function colorPickerMouseOver(color_code: string) {
  const mode = document.getElementById("color_picker")!.getAttribute("mode");
  if (mode === "highlight") {
    return;
  } else if (mode === "comment") {
    const comment_id = document
      .getElementById("color_picker")!
      .getAttribute("comment_id");

    const comment_div = document
      .getElementById("comment_div")!
      .querySelector<HTMLDivElement>(
        `div.comment[comment_id="${comment_id}"]`
      )!;

    const polygon_element = document
      .getElementById("comment_svg")!
      .querySelector<SVGPolygonElement>(`polygon[comment_id="${comment_id}"]`)!;

    const commented_span_arr = document.querySelectorAll<HTMLSpanElement>(
      `span.commented[comment_id="${comment_id}"]`
    );

    comment_div.style.backgroundColor = color_code;
    comment_div.style.borderColor = color_code;
    polygon_element.style.fill = color_code;
    polygon_element.style.stroke = color_code;
    commented_span_arr.forEach((span) => {
      span.style.backgroundColor = color_code;
      span.style.borderColor = color_code;
    });
  } else {
    const color_id = document
      .getElementById("color_picker")!
      .getAttribute("color_id");
    Array.from(document.getElementById("word_query")!.querySelectorAll("span"))
      .filter((span) => {
        return span.getAttribute("color_id") === color_id;
      })
      .forEach((span) => {
        console.log(color_code);
        span.style.setProperty("background-color", color_code, "important");
        span.style.color = sat.word.calcWordColor(color_code);
      });
  }
}

/**
 * color pickerのマウスアウトイベント
 */
// @ts-ignore
function colorPickerMouseOut() {
  const mode = document.getElementById("color_picker")!.getAttribute("mode");
  if (mode === "highlight") {
    return;
  } else if (mode === "comment") {
    const comment_id = document
      .getElementById("color_picker")!
      .getAttribute("comment_id");
    const comment_div = document
      .getElementById("comment_div")!
      .querySelector<HTMLDivElement>(
        `div.comment[comment_id="${comment_id}"]`
      )!;
    const polygon_element = document
      .getElementById("comment_svg")!
      .querySelector<SVGPolygonElement>(`polygon[comment_id="${comment_id}"]`)!;
    const commented_span_arr = document.querySelectorAll<HTMLSpanElement>(
      `span.commented[comment_id="${comment_id}"]`
    );
    let color_code = document
      .getElementById("color_picker")!
      .getAttribute("comment_color")!;
    comment_div.style.backgroundColor = color_code;
    comment_div.style.borderColor = color_code;
    polygon_element.style.fill = color_code;
    polygon_element.style.stroke = color_code;
    commented_span_arr.forEach((span) => {
      span.style.backgroundColor = color_code;
      span.style.borderColor = color_code;
    });
  } else {
    const color_id = document
      .getElementById("color_picker")!
      .getAttribute("color_id");
    Array.from(document.getElementById("word_query")!.querySelectorAll("span"))
      .filter((span) => {
        return span.getAttribute("color_id") === color_id;
      })
      .forEach((span) => {
        span.removeAttribute("style");
      });
  }
}

/**
 * color pickerがクリックされた時に実行。色を変更して反転処理を行う。
 * @param {string} color_code クリックされたカラーコード
 */
// @ts-ignore
function colorPickerClick(color_code: string) {
  color_code = color_code.toLowerCase();

  const mode = document.getElementById("color_picker")!.getAttribute("mode");
  if (mode === "highlight") {
    const btn_highlight = document.getElementById("btn_highlight")!;
    btn_highlight.setAttribute("highlightColor", color_code);
    btn_highlight.style.backgroundColor = color_code;
  } else if (mode === "comment") {
    document.getElementById("btn_comment")!.style.backgroundColor = color_code;
    document.getElementById("comment_color")!.innerText = color_code;

    sat.comment.background_color = color_code;
    document
      .getElementById("color_picker")!
      .setAttribute("comment_color", color_code);
    sat.cv.updateData();
    sat.cv.draw();
  } else {
    const color_id = document
      .getElementById("color_picker")!
      .getAttribute("color_id")!;

    showSpinner("ワード反転中...", 0, () => {
      sat.word.setColor(Number(color_id), color_code);
      sat.word.invert(sat.content_root);
      setColoredQuery();
      sat.cv.updateData();
      sat.cv.draw();
    });
  }
  document.getElementById("color_picker")!.style.display = "none";
}

/*
 * ====================== 多図面関連 ======================
 */

/**
 * 図面等のデータをセット
 * @param {object} data 図面等のデータ
 */
// @ts-ignore
function setDataFromTazumenBrowser(data: any) {
  (document.getElementById("doc_title")! as HTMLInputElement).value =
    data.page_title;
  document.title = data.page_title;
  document.getElementById("content")!.innerHTML = data.text_content;

  const zumen_container = document.getElementById("zumen")!;
  const caption_dic: { [zumen_num: string]: string } = {};
  const zumen_tags = document
    .getElementById("content")!
    .innerText.match(/【図[^】]+】[^【]+/g);
  if (zumen_tags) {
    zumen_tags.forEach((caption) => {
      const arr = caption.match(/【(図[^】]+)】([^【]+)/);
      if (arr?.length === 3) {
        caption_dic[zenkaku2Hankaku(arr[1]!)] = arr[2]!;
      }
    });
  }

  data.zumen_arr.forEach((zumen: any) => {
    const container = document.createElement("div");

    const title = document.createElement("h3");
    title.innerHTML = zumen.title;
    container.appendChild(title);

    if (caption_dic[zumen.title]) {
      const caption = document.createElement("div");
      caption.innerText = caption_dic[zumen.title]!;
      caption.classList.add("cap");
      container.appendChild(caption);
    }

    const img = document.createElement("img");
    img.src = zumen.data_url;
    if ((document.getElementById("dark_mode")! as HTMLInputElement).checked) {
      img.classList.add("dark");
    }
    container.appendChild(img);

    const memo = document.createElement("div");
    memo.setAttribute("contenteditable", "true");
    memo.setAttribute("placeholder", "メモを入力...");
    memo.classList.add("memo");
    container.appendChild(memo);

    const hr = document.createElement("hr");
    container.appendChild(hr);
    zumen_container.appendChild(container);
  });

  addZumenEventHandler();

  // ワード反転
  document.getElementById("word_query")!.innerText = data.word_arr
    .map((words: string[]) => {
      return words.join("+");
    })
    .join(" ");
  sat.word.setOption(getWordOption());
  sat.word.invert(sat.content_root);
  setColoredQuery();

  sat.cv.updateData();
  sat.cv.draw();
  document.getElementById("spinner")!.classList.remove("visible");
  sat.updated = false;
}

/**
 * 図面のクリックイベントを設定
 */
function addZumenEventHandler() {
  // 図面の回転
  Array.from(document.getElementById("zumen")!.querySelectorAll("img")).forEach(
    (img) => {
      img.addEventListener("click", (e) => {
        if (!(e.target instanceof HTMLElement)) return;
        if (g_zumen_clicked) {
          // ダブルクリック判定（画像の別ウィンドウ起動）
          const zumen_subwin = window.open(
            "",
            "",
            `width=500,height=500,scrollbars=yes,resizable=yes,status=yes`
          )!;

          // タイトル設定
          let title = document.title;
          if (e.target.parentElement!.querySelector("h3")) {
            title = `図${e.target
              .parentElement!.querySelector("h3")!
              .innerText.substr(1)} - ${title}`;
          }
          zumen_subwin.document.title = title;
          const h3 = document.createElement("h3");
          h3.innerText = title;
          h3.style.textAlign = "center";
          h3.style.height = "20px";
          zumen_subwin.document.body.append(h3);

          // 画像設定
          const img_div = document.createElement("div");
          img_div.style.width = "90%";
          img_div.style.height = "90%";
          img_div.style.textAlign = "center";
          const img_clone = e.target.cloneNode() as HTMLImageElement;
          img_clone.style.objectFit = "contain";
          img_clone.style.width = "90%";
          img_clone.style.height = "90%";
          if (document.body.classList.contains("dark")) {
            zumen_subwin.document.body.style.color = "#ddd";
            zumen_subwin.document.body.style.backgroundColor = "#333";
            img_clone.style.filter = "invert(100%)";
          }
          img_div.appendChild(img_clone);
          zumen_subwin.document.body.append(img_div);

          // 説明文設定
          if (e.target.parentElement!.querySelector("div.cap")) {
            const caption = document.createElement("div");
            caption.innerText = (
              e.target.parentElement!.querySelector("div.cap")! as HTMLElement
            ).innerText;
            caption.style.textAlign = "center";
            zumen_subwin.document.body.append(caption);
          }

          g_zumen_clicked = false;
          return;
        }

        g_zumen_clicked = true;

        setTimeout(() => {
          return ((e) => {
            if (g_zumen_clicked && e.target instanceof HTMLImageElement) {
              // シングルクリック判定（画像の回転）
              e.target.src = rotateBase64Image90deg(e.target.src);
            }

            g_zumen_clicked = false;
          })(e);
        }, 300);
      });
    }
  );

  // 本文中の図面へのリンク
  Array.from(document.getElementById("content")!.querySelectorAll("a")).forEach(
    (a) => {
      a.addEventListener("click", (e) => {
        if (!(e.target instanceof HTMLElement)) return;
        const fig_num = zenkaku2Hankaku(e.target.innerText);
        Array.from(
          document.getElementById("zumen")!.querySelectorAll("h3")
        ).some((h3) => {
          if (h3.innerText === fig_num) {
            h3.scrollIntoView();
            return true;
          }
          return false;
        });
      });
    }
  );
}

/**
 * 図面の表示切り替え
 */
function toggleZumenColumn() {
  const zumen = document.getElementById("zumen")!;
  if (zumen === null) return;

  if (window.getComputedStyle(zumen).display === "none") {
    zumen.style.display = "inline";
  } else {
    zumen.style.display = "none";
  }
  sat.cv.updateData();
  sat.cv.draw();
  sat.comment.sort();
  sat.comment.arrange();
}

// https://stackoverflow.com/questions/17040360/javascript-function-to-rotate-a-base-64-image-by-x-degrees-and-return-new-base64
function rotateBase64Image90deg(base64Image: any) {
  // create an off-screen canvas
  const offScreenCanvas = document.createElement("canvas");
  const offScreenCanvasCtx = offScreenCanvas.getContext("2d")!;

  // cteate Image
  const img = new Image();
  img.src = base64Image;

  // set its dimension to rotated size
  offScreenCanvas.height = img.width;
  offScreenCanvas.width = img.height;

  // rotate and draw source image into the off-screen canvas:
  offScreenCanvasCtx.rotate((90 * Math.PI) / 180);
  offScreenCanvasCtx.translate(0, -offScreenCanvas.width);

  offScreenCanvasCtx.drawImage(img, 0, 0);

  // encode image to data-uri with base64
  return offScreenCanvas.toDataURL("image/jpeg", 100);
}
// @ts-ignore
function invertImage() {
  Array.from(document.getElementById("zumen")!.querySelectorAll("img")).forEach(
    (img) => {
      if (img.classList.contains("dark")) {
        img.classList.remove("dark");
      } else {
        img.classList.add("dark");
      }
    }
  );
}

/*
 * ====================== PDF版関連 ======================
 */

// /**
//  * コメントなどの内容をJSONファイルとしてダウンロード
//  */
// async function downloadJSON() {
//   const download_object = JSON.parse(
//     JSON.stringify({
//       word_option: sat.word.option,
//       word_selected_color: sat.word.selected_color,
//       word_query: document.getElementById("word_query")!.innerHTML,
//       // decoration: sat.decoration.element_info,
//       comment_span: sat.comment.span_info,
//       comment_box: sat.comment.box_info,
//     })
//   );

//   const blob = new Blob([JSON.stringify(download_object)], {
//     type: "text/json",
//   });
//   const url = window.URL || window.webkitURL;
//   const blobURL = url.createObjectURL(blob);

//   // <a> を新たに作成し、ダウンロード用の設定をいろいろ
//   const a = document.createElement("a");
//   a.download = `${sat.pdf.file_name}.json`;
//   a.href = blobURL;

//   document.body.appendChild(a);
//   a.click();
//   document.body.removeChild(a);
//   sat.updated = false;
// }

// /**
//  * コメントなどの内容を含んだJSONデータのロード
//  * @param {object} json_object ロードするJSONオブジェクト
//  */
// // @ts-ignore
// function loadJSON(json_object: any) {
//   sat.pdf.init();
//   sat.word.option = json_object.word_option;
//   sat.word.selected_color = json_object.word_selected_color;
//   document.getElementById("word_query")!.innerHTML = json_object.word_query;
//   // sat.decoration.element_info = json_object.decoration;
//   sat.comment.span_info = json_object.comment_span;
//   sat.comment.box_info = json_object.comment_box;
// }

// /**
//  * PDFの読み込みや拡大縮小に合わせてコメント部分を調整
//  */
// // @ts-ignore
// function updateCommentContainer() {
//   if (!sat) return;
//   const ifr = document.querySelector("iframe")!.contentWindow!.document;
//   const ifr_scroll_height =
//     ifr.getElementById("toolbarViewer")!.scrollHeight +
//     ifr.getElementById("viewerContainer")!.scrollHeight;

//   Array.from(
//     document.getElementById("comment_div")!.querySelectorAll("div.comment")
//   ).forEach((div) => {
//     sat.comment.box_info[div.getAttribute("comment_id")!]!.content = (
//       div as HTMLElement
//     ).innerText;
//   });
//   sat.comment.box_sorted_info = [];
//   const comment_svg = document.getElementById("comment_svg")!;
//   const comment_div = document.getElementById("comment_div")!;
//   (comment_svg.childNodes[0]! as HTMLElement).innerHTML = "";
//   comment_svg.style.height = `${ifr_scroll_height}px`;
//   comment_div.innerHTML = "";
//   comment_div.style.height = `${ifr_scroll_height}px`;
// }

// @ts-ignore
function decoratePage(page_number: number) {
  // sat.pdf.restore(page_number);
  const mark_content_root = sat.content_window.document
    .getElementById("viewer")!
    .querySelector<HTMLDivElement>(
      `div.page[data-page-number="${page_number}"]`
    )!;
  sat.word.invert(mark_content_root);
  sat.cv.updateData();
  sat.cv.draw();
}

// // @ts-ignore
// function initPDFViewer() {
//   sat.updated = false;
//   (
//     document.getElementById("comment_svg")!.childNodes[0]! as HTMLElement
//   ).innerHTML = "";
//   document.getElementById("comment_div")!.innerHTML = "";
//   sat.pdf.init();
// }
/*
 * ====================== その他 ======================
 */

/**
 * スピナー画面を表示して実行
 */
function showSpinner(message: string, msec: number, exec_func: any) {
  document.getElementById("loading_message")!.innerHTML = message;
  const spinner = document.getElementById("spinner")!;
  spinner.classList.add("visible");
  new Promise((resolve, reject) => {
    setTimeout(() => {
      exec_func();
      resolve(null);
    }, msec);
  }).then(() => {
    spinner.classList.remove("visible");
  });
}

/**
 * 英数字を半角にする
 * https://www.yoheim.net/blog.php?q=20191101
 * @param {string} str 英数字を半角にしたい文字列
 * @return {string} 英数字を半角にした文字列
 */
function zenkaku2Hankaku(str: string): string {
  return str.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => {
    return String.fromCharCode(s.charCodeAt(0) - 0xfee0);
  });
}
