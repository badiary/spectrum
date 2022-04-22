import { getSelection } from "../node_modules/rangy2/bundles/index.umd";
import { createClassApplier } from "../node_modules/rangy-classapplier/bundles/index.umd";
import Mark from "../node_modules/mark.js/dist/mark";

export type toolType = "free_text" | "tazumen" | "pdf" | "web";
export type WordOption = {
  words: string[];
  color: string;
};

export class Sat {
  tool_type: toolType; // フリーテキスト版、PDF版などを指定
  content_root: HTMLElement; // コンテンツを含む要素を指定
  content_window: Window; // コンテンツを含むウィンドウを指定（PDF版はiframeのwindowになる）
  dark_mode: boolean;
  zumen_analysis_mode: boolean;
  updated: boolean = false; // 内容が更新されているかのフラグ（ページ遷移に対して警告を出す用）

  word: SatWord; // ワード反転を扱うオブジェクト
  cv: SatCanvas; // スペクトルバーの描画を扱うオブジェクト
  decoration: SatDecoration; // マーカー、太字、下線の装飾を扱うオブジェクト
  comment: SatComment; // コメントを扱うオブジェクト
  tazumen: SatTazumen;
  // pdf: SatPDF; // PDF版の特別な処理を扱うオブジェクト

  constructor(
    tool_type: toolType,
    content_root: HTMLElement,
    content_window: Window,
    cv: HTMLCanvasElement,
    selected_color: { [key: string]: string },
    dark_mode: boolean,
    zumen_analysis_mode: boolean,
    block_mode: boolean
  ) {
    this.tool_type = tool_type;
    this.content_root = content_root;
    this.content_window = content_window;
    this.dark_mode = dark_mode;
    this.zumen_analysis_mode = zumen_analysis_mode;

    this.word = new SatWord(this, selected_color, block_mode);
    this.cv = new SatCanvas(this, cv);
    this.comment = new SatComment(this);
    this.decoration = new SatDecoration(this);
    this.tazumen = new SatTazumen(this);
    // this.pdf = new SatPDF(this);
  }

  /**
   * 対応するspan要素を削除。ただし、複数のクラスや属性があった場合は、指定したクラスや属性だけ削除してspanを残す
   * @param {span_element} el 削除したいspan
   * @param {class_name_arr} array 削除したいクラス名の配列
   * @param {attribute_name_arr} array 削除したい属性名の配列
   */
  removeSpan = (
    span: HTMLSpanElement,
    class_name_arr: string[],
    attribute_name_arr: string[]
  ): void => {
    class_name_arr.forEach((class_name): void => {
      span.classList.remove(class_name);
    });

    attribute_name_arr.forEach((attribute_name): void => {
      span.removeAttribute(attribute_name);
    });

    // if (span.classList.length === 0 && span.getAttribute("style") === null) {
    if (span.classList.length === 0) {
      const parent = span.parentElement!;
      span.replaceWith(...Array.from(span.childNodes));
      parent.normalize();
    }
  };

  /**
   * container要素におけるelement要素のxy座標を取得
   * @return { offset_top: x座標, offset_left: y座標 }
   */
  getOffset = (
    element: HTMLElement,
    container: HTMLElement
  ): { offset_top: number; offset_left: number } => {
    let offset_top = element.offsetTop;
    let offset_left = element.offsetLeft;
    let offset_parent = element.offsetParent as HTMLElement;
    while (offset_parent !== container && offset_parent !== null) {
      offset_top +=
        offset_parent.offsetTop +
        Number(
          this.content_window
            .getComputedStyle(offset_parent)
            .borderWidth.slice(0, -2)
        ) *
          2; // TODO ここは怪しいかも
      offset_left += offset_parent.offsetLeft;
      offset_parent = offset_parent.offsetParent as HTMLElement;
    }
    return { offset_top: offset_top, offset_left: offset_left };
  };

  /**
   * RGBをカラーコードに変換
   * https://decks.hatenadiary.org/entry/20100907/1283843862
   * @param col "rgb(R, G, B)"の形式の文字列
   * @return "#000000"形式のカラーコード
   */
  rgbTo16 = (col: string): string => {
    return (
      "#" +
      col
        .match(/\d+/g)
        ?.map((a: string) => {
          return ("0" + parseInt(a).toString(16)).slice(-2);
        })
        .join("")
    );
  };

  /**
   * HSLをRGBのカラーコードに変換
   * @param _h
   * @param s
   * @param l
   * @returns "#000000"形式のカラーコード
   */
  hslToRgb = (_h: number, s: number, l: number): string => {
    const h = Math.min(_h, 359) / 60;

    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h % 2) - 1));
    const m = l - 0.5 * c;

    let r = m,
      g = m,
      b = m;

    if (h < 1) {
      (r += c), (g = +x), (b += 0);
    } else if (h < 2) {
      (r += x), (g += c), (b += 0);
    } else if (h < 3) {
      (r += 0), (g += c), (b += x);
    } else if (h < 4) {
      (r += 0), (g += x), (b += c);
    } else if (h < 5) {
      (r += x), (g += 0), (b += c);
    } else if (h < 6) {
      (r += c), (g += 0), (b += x);
    } else {
      (r = 0), (g = 0), (b = 0);
    }

    return (
      "#" +
      `0${Math.floor(r * 255).toString(16)}`.slice(-2) +
      `0${Math.floor(g * 255).toString(16)}`.slice(-2) +
      `0${Math.floor(b * 255).toString(16)}`.slice(-2)
    );
  };

  /**
   * 要素のセレクタを取得（参考：https://akabeko.me/blog/2015/06/get-element-selector/）
   * @param {object} el セレクタを取得したいエレメント
   * @returns {string} セレクタ
   */
  getSelectorFromElement = (el: any): string[] => {
    const names = [];

    while (el) {
      let name = el.nodeName.toLowerCase();
      if (el.id) {
        name += "#" + el.id;
        names.unshift(name);
        break;
      }

      const index = this.getSiblingElementsIndex(el, name);
      name += ":nth-of-type(" + index + ")";

      names.unshift(name);
      el = el.parentNode;
    }

    return names;
  };

  /**
   * 親要素に対して何番目の子要素かを取得
   * https://github.com/akabekobeko/examples-web-app/tree/get-element-selector/get-element-selector
   * @param el 調べたい子要素
   * @return index 何番目かを表す数値
   */

  getSiblingElementsIndex = (el: Element, name: string): number => {
    let index = 1;
    let sib = el;

    while ((sib = sib.previousElementSibling!)) {
      if (sib.nodeName.toLowerCase() === name) {
        ++index;
      }
    }

    return index;
  };
}

class SatWord {
  sat: Sat;
  option: { [key: string]: WordOption } = {};
  selected_color: { [key: string]: string } = {};
  block_mode: boolean = false;

  constructor(
    sat: Sat,
    selected_color: { [key: string]: string },
    block_mode: boolean
  ) {
    this.sat = sat;
    this.selected_color = selected_color;
    this.block_mode = block_mode;
  }

  setOption = (option: { [key: string]: WordOption }): void => {
    this.option = option;

    // 手動で選択した色があればそれをセットする
    Object.keys(this.option).forEach((color_id) => {
      if (this.option[color_id] && this.selected_color[color_id]) {
        this.option[color_id]!.color = this.selected_color[color_id]!;
      }
    });
  };

  setColor = (color_id: number, color: string): void => {
    this.selected_color[color_id] = color;
    if (this.option[color_id]) this.option[color_id]!.color = color;
  };
  invert(root: HTMLElement): void {
    // ワード反転解除
    this.clear(root);

    const mark_instance = new Mark(root);
    const mark_options = {
      element: "span",
      accuracy: "partially",
      separateWordSearch: false,
      acrossElements: true,
      ignoreJoiners: true,
      ignorePunctuation: ":;.,-–—‒_(){}[]!'\"+=".split(""),
      each: (elem: HTMLElement) => {
        elem.classList.add("word_inversion");
      },
      className: "",
    };

    if (this.sat.tool_type === "web") {
      mark_options.accuracy = "complementary";
    }
    const colorStyle = document.createElement("style");
    colorStyle.type = "text/css";
    colorStyle.id = "SAT_word_inversion";
    const colorStyle_pdf_parent = document.createElement("style");
    colorStyle_pdf_parent.type = "text/css";
    colorStyle_pdf_parent.id = "SAT_word_inversion";

    this.sat.content_window.document.head.prepend(colorStyle);
    if (this.sat.tool_type === "pdf") {
      document.head.prepend(colorStyle_pdf_parent);
    }

    for (const color_id in this.option) {
      mark_options.className = `word_inversion_class${Number(color_id)}`;
      const color_code = this.option[color_id]!.color;

      colorStyle.sheet!.insertRule(
        `span.word_inversion_class${color_id} {background-color: ${color_code} !important; color: ${
          this.sat.tool_type === "pdf"
            ? color_code
            : this.calcWordColor(color_code)
        }}`,
        0
      );
      if (this.sat.tool_type === "pdf") {
        colorStyle_pdf_parent.sheet!.insertRule(
          `span.word_inversion_class${color_id} {background-color: ${color_code} ! important; color: ${this.calcWordColor(
            color_code
          )}}`,
          0
        );
      }

      this.option[color_id]!.words.forEach((word: string) => {
        if (/^\/.*\/[dgimsuy]*$/.test(word)) {
          // 元々正規表現の場合
          let re_option = "";
          if (word.match(/([dgimsuy]+)$/)) {
            re_option = word.match(/([dgimsuy]+)$/)![0]!;
            word = word.slice(0, -re_option.length);
          }
          let reg_ex: RegExp;
          if (this.block_mode) {
            reg_ex = new RegExp(
              `[ァ-ヶｦ-ﾟー一-龥0-9０-９a-zA-Zａ-ｚＡ-Ｚ.．]*${word.slice(
                1,
                -1
              )}[ァ-ヶｦ-ﾟー一-龥0-9０-９a-zA-Zａ-ｚＡ-Ｚ.．]*`,
              re_option
            );
          } else {
            reg_ex = new RegExp(word.slice(1, -1), re_option);
          }
          mark_instance.markRegExp(reg_ex, mark_options);
        } else {
          // 正規表現でない場合
          if (this.block_mode) {
            const reg_ex = new RegExp(
              `[ァ-ヶｦ-ﾟー一-龥0-9０-９a-zA-Zａ-ｚＡ-Ｚ.．]*${word}[ァ-ヶｦ-ﾟー一-龥0-9０-９a-zA-Zａ-ｚＡ-Ｚ.．]*`,
              "i"
            );
            mark_instance.markRegExp(reg_ex, mark_options);
          } else {
            mark_instance.mark(word, mark_options);
          }
        }
      });
    }
  }
  clear = (root: HTMLElement): void => {
    Array.from(
      root.querySelectorAll<HTMLSpanElement>("span.word_inversion")
    ).forEach((span) => {
      Array.from(span.classList).forEach((class_name) => {
        if (class_name.indexOf("word_inversion") !== -1) {
          span.classList.remove(class_name);
        }
      });
      span.removeAttribute("data-markjs");
      if (span.classList.length === 0 && span.attributes.length === 1) {
        // spanを削除
        const parent = span.parentNode;
        while (span.firstChild) parent!.insertBefore(span.firstChild, span);
        parent!.removeChild(span);
        parent!.normalize(); // 反転されていたテキストノードを周囲のテキストノードと結合
      }
    });

    let preexisting_style = this.sat.content_window.document.head.querySelector(
      "style#SAT_word_inversion"
    );
    if (preexisting_style !== null) {
      preexisting_style.remove();
    }

    if (this.sat.tool_type === "pdf") {
      preexisting_style = document.head.querySelector(
        "style#SAT_word_inversion"
      );
      if (preexisting_style !== null) {
        preexisting_style.remove();
      }
    }
  };
  getWordColors = (length: number): string[] => {
    // https://gist.github.com/ibrechin/2489005 から拝借して一部改変

    const colors: string[] = [];
    const step = 360 / length;
    const l = this.sat.dark_mode ? 0.35 : 0.7;
    for (let i = 0; i < length; i++) {
      // 適当に設定
      colors.push(this.sat.hslToRgb((0 + i * step) % 360, 1.0, l));
    }

    return colors;
  };
  calcWordColor = (bg_color: string): string => {
    const brightness =
      parseInt(bg_color.substr(1, 2), 16) * 0.299 + // Red
      parseInt(bg_color.substr(3, 2), 16) * 0.587 + // Green
      parseInt(bg_color.substr(5, 2), 16) * 0.114; // Blue

    return brightness >= 140 ? "#111" : "#eed";
  };
}

type Rect = [string, number, number, number, number, number];
class SatCanvas {
  sat: Sat;
  element: HTMLCanvasElement;
  word_rect: Rect[] = [];
  comment_circle: { y: number; color: string }[] = [];
  highlight_rect: { y: number; color: string }[] = [];
  constructor(sat: Sat, element: HTMLCanvasElement) {
    this.sat = sat;
    this.element = element;
  }

  updateData = () => {
    // ワード反転のバーの色や位置を更新
    this.word_rect = [];
    const color_dic: { [key: string]: number } = {};
    Array.from(
      new Set(
        Object.keys(this.sat.word.option).map((color_id: string) => {
          return this.sat.word.option[color_id]!.color;
        })
      )
    )
      .filter((color: string) => {
        return color !== "";
      })
      .forEach((color: string, i: number) => {
        color_dic[color] = i;
      });
    const color_num = Object.keys(color_dic).length;

    const span_parent_height =
      this.sat.content_root.parentElement!.scrollHeight;

    Array.from(
      this.sat.content_root.querySelectorAll<HTMLSpanElement>(
        "span.word_inversion"
      )
    ).forEach((span) => {
      const fill_color = this.sat.rgbTo16(
        window.getComputedStyle(span).backgroundColor
      );
      const left_offset =
        this.sat.tool_type === "web" || this.sat.tool_type === "pdf" ? 0 : 35;
      const rect_x =
        left_offset +
        (this.element.width - left_offset) *
          (color_dic[fill_color]! / color_num);

      const offset = this.sat.getOffset(
        span,
        this.sat.content_root.offsetParent as HTMLElement
      );
      const rect_y =
        this.element.height * (offset.offset_top / span_parent_height);
      const rect_height =
        3 * Math.max(span.offsetHeight / this.element.height, 2);
      this.word_rect.push([
        fill_color,
        Math.round(rect_x) - 0.5,
        Math.round(rect_y - rect_height / 2.0) - 0.5,
        Math.round((this.element.width - left_offset) / color_num) + 0,
        5,
        Math.round(rect_height / 2.0),
      ]);
    });

    // コメント部分の●の位置を更新
    this.comment_circle = [];

    // comment_idごとにグループ化したspan要素の配列を作成する
    const span_element_dic: { [comment_id: string]: HTMLSpanElement[] } =
      Array.from(
        this.sat.content_root.querySelectorAll<HTMLSpanElement>(
          "span.commented"
        )
      )
        .map((span: HTMLSpanElement) => {
          // それぞれのspanの位置（ページ最初からのoffsetTop, offsetLeft）を計算しておく
          const offset = this.sat.getOffset(
            span,
            this.sat.content_root.offsetParent as HTMLElement
          );
          span.setAttribute("offset_top", offset.offset_top.toString());
          span.setAttribute("offset_left", offset.offset_left.toString());
          return span;
        })
        .reduce(
          (
            r: { [comment_id: string]: HTMLSpanElement[] },
            a: HTMLSpanElement
          ) => {
            r[a.getAttribute("comment_id")!] = [
              ...(r[a.getAttribute("comment_id")!] || []),
              a,
            ];
            return r;
          },
          {}
        ); // ひとまずcommment_idごとにグループ化した連想配列を作成
    const span_element_arr: HTMLSpanElement[][] = Object.keys(span_element_dic)
      .map((key: string) => {
        // ここで連想配列を配列に変更
        return span_element_dic[key]!.sort(
          (a: HTMLSpanElement, b: HTMLSpanElement) => {
            // グループ内ではoffsetTop、offsetLeftの順にソートしておく
            if (a.getAttribute("offset_top") !== b.getAttribute("offset_top")) {
              return a.getAttribute("offset_top")! <
                b.getAttribute("offset_top")!
                ? -1
                : 1;
            } else {
              return a.getAttribute("offset_left")! <
                b.getAttribute("offset_left")!
                ? -1
                : 1;
            }
          }
        );
      })
      .sort((a: HTMLSpanElement[], b: HTMLSpanElement[]) => {
        // グループ間では、最初のspanのoffsetTop、offsetLeftの順にソートしておく
        if (
          a[0]!.getAttribute("offset_top") !== b[0]!.getAttribute("offset_top")
        ) {
          return a[0]!.getAttribute("offset_top")! <
            b[0]!.getAttribute("offset_top")!
            ? -1
            : 1;
        } else {
          return a[0]!.getAttribute("offset_left")! <
            b[0]!.getAttribute("offset_left")!
            ? -1
            : 1;
        }
      });
    span_element_arr.forEach((span: HTMLSpanElement[]) => {
      this.comment_circle.push({
        y:
          this.element.height *
          (this.sat.getOffset(
            span[0]!,
            this.sat.content_root.offsetParent as HTMLElement
          ).offset_top /
            span_parent_height),
        color: span[0]!.style.backgroundColor,
      });
    });

    // ハイライト部分の●の位置を更新
    this.highlight_rect = [];
    Array.from(
      document.querySelectorAll<HTMLSpanElement>("span.highlighted")
    ).forEach((span) => {
      this.highlight_rect.push({
        y:
          this.element.height *
          ((this.sat.getOffset(
            span,
            this.sat.content_root.offsetParent as HTMLElement
          ).offset_top -
            3) /
            span_parent_height),
        color: span.style.backgroundColor,
      });
    });
  };

  draw = () => {
    const ctx = this.element.getContext("2d")!;
    ctx.clearRect(0, 0, this.element.width, this.element.height);
    if (this.sat.tool_type === "web" || this.sat.tool_type === "pdf") {
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, 200, window.innerHeight);
    } else {
      ctx.fillStyle = "#333333";
      ctx.fillRect(0, 0, 30, window.innerHeight);
    }

    this.word_rect.forEach((rect_arr): void => {
      ctx.fillStyle = rect_arr[0];
      ctx.fillRect(rect_arr[1], rect_arr[2], rect_arr[3], rect_arr[4]);
    });

    // ctx.fillStyle = "red";
    this.comment_circle.forEach(
      (comment_circle: { y: number; color: string }): void => {
        ctx.fillStyle = comment_circle.color;
        ctx.beginPath();
        ctx.arc(10, comment_circle.y, 5, 0, 2 * Math.PI, false);
        ctx.fill();
      }
    );
    this.highlight_rect.forEach(
      (highlight_rect: { y: number; color: string }): void => {
        ctx.fillStyle = highlight_rect.color;
        ctx.fillRect(20, highlight_rect.y - 5, 10, 10);
      }
    );

    ctx.strokeStyle = "white";
    ctx.lineWidth = 5;
    let scroll_div: HTMLElement;
    if (this.sat.tool_type === "pdf") {
      scroll_div = this.sat.content_root.parentElement as HTMLElement;
    } else if (this.sat.tool_type === "web") {
      // @ts-ignore
      scroll_div = document.scrollingElement;
    } else {
      scroll_div = document.getElementById("main") as HTMLElement;
    }
    const scrollTop = scroll_div.scrollTop;
    const span_parent_height = scroll_div.scrollHeight;

    const top_height = document.querySelector<HTMLDivElement>("div.top")
      ? document.querySelector<HTMLDivElement>("div.top")!.offsetHeight
      : 0;
    ctx.strokeRect(
      2.5,
      scrollTop * (this.element.height / span_parent_height),
      this.element.width - 2.5,
      (window.innerHeight - top_height) *
        (this.element.height / span_parent_height)
    );
  };
}

class SatDecoration {
  sat: Sat;
  // element_info: {
  //   selector: string;
  //   page_number: number;
  //   class_name: string;
  //   start: number;
  //   length: number;
  // }[] = [];
  constructor(sat: Sat) {
    this.sat = sat;
  }

  add = (class_name: string): void => {
    createClassApplier(class_name, {
      elementTagName: "span",
      normalize: true,
    }).toggleSelection(this.sat.content_window);
  };

  highlight = (color_code: string): void => {
    createClassApplier("highlighted_tmp", {
      elementTagName: "span",
      normalize: false,
    }).toggleSelection(this.sat.content_window);
    const sel = getSelection(this.sat.content_window);
    sel
      .getRangeAt(0)
      .getNodes([], (node: Node) => {
        return (
          node instanceof HTMLSpanElement &&
          node.classList.contains("highlighted_tmp")
        );
      })
      .forEach((span: HTMLSpanElement) => {
        span.style.backgroundColor = color_code;
        span.style.borderBottomColor = color_code;
        span.classList.remove("highlighted_tmp");
        span.classList.add("highlighted");
      });
    let parent_highlighted_span = sel
      .getRangeAt(0)
      .commonAncestorContainer.parentElement.closest("span.commented");
    if (parent_highlighted_span) {
      parent_highlighted_span.style.backgroundColor = color_code;
      parent_highlighted_span.classList.remove("highlighted_tmp");
      parent_highlighted_span.classList.add("highlighted");
    }

    this.sat.cv.updateData();
    this.sat.cv.draw();
  };

  dehighlight = (): void => {
    const sel = getSelection(this.sat.content_window);

    // 選択領域に包含されるspanのハイライトを削除
    if (sel.rangeCount) {
      sel
        .getRangeAt(0)
        .getNodes([1])
        .forEach((node: Node) => {
          if (!(node instanceof HTMLSpanElement)) return;
          if (node.classList.length > 0) {
            Array.from(node.classList).forEach((class_name) => {
              if (class_name === "highlighted") {
                node.style.backgroundColor = "";
                node.style.borderBottomColor = "";
                this.sat.removeSpan(node, [class_name], []);
              }
            });
          } else {
            node.style.backgroundColor = "";
          }
        });

      // 選択領域を包含するspanのハイライトを削除
      [
        getSelection(this.sat.content_window).getRangeAt(0).startContainer,
        getSelection(this.sat.content_window).getRangeAt(0).endContainer,
      ].forEach((container) => {
        while (container && container !== this.sat.content_root) {
          const parent_element = container.parentElement;
          if (container instanceof HTMLSpanElement) {
            if (container.classList.length > 0) {
              Array.from(container.classList).forEach((class_name) => {
                if (class_name === "highlighted") {
                  container.style.backgroundColor = "";
                  container.style.borderBottomColor = "";
                  this.sat.removeSpan(container, [class_name], []);
                }
              });
            } else {
              container.style.backgroundColor = "";
            }
          }
          container = parent_element;
        }
      });
    }
    this.sat.cv.updateData();
    this.sat.cv.draw();
  };
}

class SatComment {
  sat: Sat;
  comment_index: number = 0;
  span_info: {
    [comment_id: string]: {
      selector: string;
      page_number: number;
      class_name: string;
      start: number;
      length: number;
    }[]; // （PDF版用）コメントされたspanの情報とページ番号を保持
  } = {};
  box_info: { [comment_id: string]: { content: string; page_number: number } } =
    {}; // （PDF版用）コメント内容とページ番号を保持
  box_sorted_info: {
    comment_id: string;
    first_span: HTMLSpanElement;
    div: HTMLDivElement;
    polygon: SVGPolygonElement;
  }[] = [];

  constructor(sat: Sat) {
    this.sat = sat;
  }
  addComment = (color_code: string): void => {
    const comment_id = this.addSpan(color_code);
    this.addBox(comment_id, color_code);
    this.sort();
    this.arrange();

    // コメントボックスにカーソルを移動
    const range = window.document.createRange();
    const el = window.document.querySelector<HTMLDivElement>(
      `div.comment[comment_id="${comment_id}"] > p`
    )!;
    range.setStart(el, 0);
    range.setEnd(el, 0);

    window.focus();
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);

    this.sat.cv.updateData();
    this.sat.cv.draw();
  };

  remove = (comment_id: string): void => {
    this.sat.content_root
      .querySelectorAll<HTMLSpanElement>(
        `span.commented[comment_id="${comment_id}"]`
      )
      .forEach((element, i) => {
        this.sat.removeSpan(
          element,
          ["commented", "span_onmouse"],
          ["comment_id"]
        );
      });

    // コメントに対応するdiv、polygonを削除
    document
      .getElementById("comment_div")!
      .querySelector(`div.comment[comment_id="${comment_id}"]`)
      ?.remove();
    Array.from(
      document
        .getElementById("comment_svg")!
        .querySelectorAll(`polygon[comment_id="${comment_id}"]`)
    ).forEach((polygon) => {
      polygon.remove();
    });

    // 記憶情報の対応部分を削除
    delete this.span_info[comment_id];
    delete this.box_info[comment_id];
  };

  addSpan = (color_code: string): string => {
    createClassApplier("commented", {
      elementTagName: "span",
      normalize: true,
    }).toggleSelection(this.sat.content_window);

    // comment_idを決定
    const comment_id_arr: { [comment_id: string]: string } = {};
    const added_span_elements: HTMLSpanElement[] = [];
    Array.from(
      this.sat.content_root.querySelectorAll<HTMLSpanElement>(`span.commented`)
    ).forEach((span) => {
      if (span.getAttribute("comment_id") !== null) {
        comment_id_arr[span.getAttribute("comment_id")!] = "commented";
      } else {
        added_span_elements.push(span);
      }
    });
    while (comment_id_arr[this.comment_index]) {
      this.comment_index++;
    }
    const comment_id = this.comment_index;
    this.comment_index++;

    // comment_id等の属性の付与
    added_span_elements.forEach((span) => {
      span.setAttribute("comment_id", comment_id.toString());
      // if (!span.classList.contains("highlighted")) {
      span.style.backgroundColor = color_code;
      span.style.borderColor = color_code;
      // }

      const offset = this.sat.getOffset(
        span,
        this.sat.content_root.offsetParent as HTMLElement
      );
      span.setAttribute("offset_top", offset.offset_top.toString());
      span.setAttribute("offset_left", offset.offset_left.toString());
    });

    // イベントハンドラ追加（span）
    added_span_elements.forEach((span) => {
      span.addEventListener("mouseover", (e) => {
        this.onMouseOver(span.getAttribute("comment_id")!);
      });
    });

    added_span_elements.forEach((span) => {
      span.addEventListener("mouseout", (e) => {
        // 子要素への移動であれば無視
        if (
          e.relatedTarget instanceof HTMLElement &&
          e.relatedTarget.parentElement !== null &&
          e.relatedTarget.parentElement.closest(
            `span.commented[comment_id="${span.getAttribute("comment_id")}"]`
          ) !== null
        ) {
          return;
        }
        this.onMouseOut(span.getAttribute("comment_id")!);
      });
    });

    // if (this.sat.tool_type === "pdf") {
    //   this.sat.pdf.memorize("commented");
    // }

    return comment_id.toString();
  };

  addBox = (comment_id: string, color_code: string): void => {
    const p_element = document.createElement("p");
    if (this.sat.tool_type === "pdf") {
      if (this.box_info[comment_id]) {
        p_element.innerText = this.box_info[comment_id]!.content;
      } else {
        this.box_info[comment_id] = {
          content: "",
          page_number: this.span_info[comment_id]
            ?.map((info) => {
              return Number(info.page_number);
            })
            .reduce((a: number, b: number) => {
              return Math.min(a, b);
            })!,
        };
      }
    }

    const comment_div_element = document.createElement("div");
    comment_div_element.classList.add("comment");
    comment_div_element.contentEditable = "true";
    comment_div_element.id = comment_id;
    comment_div_element.setAttribute("comment_id", comment_id);
    comment_div_element.style.backgroundColor = color_code;
    comment_div_element.style.borderColor = color_code;
    comment_div_element.appendChild(p_element);
    document.getElementById("comment_div")!.appendChild(comment_div_element);

    // 吹き出しのsvg（三角形）追加
    const polygon = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "polygon"
    );
    polygon.setAttribute("comment_id", comment_id);
    polygon.style.fill = color_code;
    polygon.style.stroke = color_code;
    document
      .getElementById("comment_svg")!
      .querySelector("svg")!
      .appendChild(polygon);

    // イベントハンドラ追加
    comment_div_element.addEventListener("mouseover", (e) => {
      this.onMouseOver(comment_div_element.getAttribute("comment_id")!);
    });

    comment_div_element.addEventListener("mouseout", (e) => {
      // 子要素への移動であれば無視
      if (
        e.relatedTarget instanceof HTMLElement &&
        e.relatedTarget.parentElement !== null &&
        e.relatedTarget.parentElement.closest(
          `div.comment[comment_id="${comment_div_element.getAttribute(
            "comment_id"
          )}"]`
        ) !== null
      ) {
        return;
      }
      this.onMouseOut(comment_div_element.getAttribute("comment_id")!);
    });

    comment_div_element.addEventListener("input", this.onInput);

    polygon.addEventListener("click", (e) => {
      this.onPolygonClick(comment_div_element.getAttribute("comment_id")!);
    });
  };

  onMouseOver = (comment_id: string): void => {
    document
      .getElementById("comment_div")!
      .querySelector(`div.comment[comment_id="${comment_id}"]`)
      ?.classList.add("div_onmouse");

    Array.from(
      this.sat.content_root.querySelectorAll(
        `span.commented[comment_id="${comment_id}"]`
      )
    ).forEach((span) => {
      span.classList.add("span_onmouse");
    });
  };
  onMouseOut = (comment_id: string): void => {
    document
      .getElementById("comment_div")!
      .querySelector(`div.comment[comment_id="${comment_id}"]`)
      ?.classList.remove("div_onmouse");
    Array.from(
      this.sat.content_root.querySelectorAll(
        `span.commented[comment_id="${comment_id}"]`
      )
    ).forEach((span) => {
      span.classList.remove("span_onmouse");
    });
  };
  onInput = () => {
    this.sat.updated = true;
  };
  onPolygonClick = (comment_id: string): void => {
    const comment_div = document
      .getElementById("comment_div")!
      .querySelector<HTMLDivElement>(
        `div.comment[comment_id="${comment_id}"]`
      )!;
    const color_picker = document.getElementById("color_picker")!;
    const color_picker_comment = document.getElementById(
      "color_picker_comment"
    )!;
    color_picker_comment.setAttribute("color_id", "comment_color");
    color_picker_comment.style.display = "block";
    const offsets = this.sat.getOffset(comment_div, this.sat.content_root);
    color_picker_comment.style.top = `${Math.max(
      offsets.offset_top - color_picker_comment.offsetHeight / 2 + 10,
      40
    )}px`;
    const zumen_div = document.getElementById("zumen");
    if (zumen_div) {
      color_picker_comment.style.left = `${
        offsets.offset_left -
        color_picker_comment.offsetWidth -
        zumen_div.offsetWidth -
        15
      }px`;
    } else {
      color_picker_comment.style.left = `${
        offsets.offset_left - color_picker_comment.offsetWidth - 15
      }px`;
    }

    color_picker.setAttribute("mode", "comment");
    color_picker.setAttribute("comment_id", comment_id);
    color_picker.setAttribute(
      "comment_color",
      comment_div.style.backgroundColor
    );
  };

  // comment_boxの高さ順を判定し、this.box_sorted_infoを設定
  sort = () => {
    // comment_idごとにグループ化したspan要素の配列を作成する
    const span_element_dic: { [comment_id: string]: HTMLSpanElement[] } =
      Array.from(
        this.sat.content_root.querySelectorAll<HTMLSpanElement>(
          "span.commented"
        )
      ).reduce(
        (
          r: { [comment_id: string]: HTMLSpanElement[] },
          a: HTMLSpanElement
        ) => {
          r[a.getAttribute("comment_id")!] = [
            ...(r[a.getAttribute("comment_id")!] || []),
            a,
          ];
          return r;
        },
        {}
      ); // ひとまずcommment_idごとにグループ化した連想配列を作成

    const span_element_arr: HTMLSpanElement[][] = Object.keys(span_element_dic)
      .map((key) => {
        // ここで連想配列を配列に変更
        return span_element_dic[key]!.sort((a, b) => {
          // グループ内ではoffsetTop、offsetLeftの順にソートしておく
          if (
            Number(a.getAttribute("offset_top")) !==
            Number(b.getAttribute("offset_top"))
          ) {
            return Number(a.getAttribute("offset_top")) <
              Number(b.getAttribute("offset_top"))
              ? -1
              : 1;
          } else {
            return Number(a.getAttribute("offset_left")) <
              Number(b.getAttribute("offset_left"))
              ? -1
              : 1;
          }
        });
      })
      .sort((a: HTMLSpanElement[], b: HTMLSpanElement[]) => {
        // グループ間では、最初のspanのoffsetTop、offsetLeftの順にソートしておく
        if (
          Number(a[0]!.getAttribute("offset_top")) !==
          Number(b[0]!.getAttribute("offset_top"))
        ) {
          return Number(a[0]!.getAttribute("offset_top")) <
            Number(b[0]!.getAttribute("offset_top"))
            ? -1
            : 1;
        } else {
          return Number(a[0]!.getAttribute("offset_left")) <
            Number(b[0]!.getAttribute("offset_left"))
            ? -1
            : 1;
        }
      });

    const div_elements = Array.from(
      document
        .getElementById("comment_div")!
        .querySelectorAll<HTMLDivElement>("div.comment")
    ).reduce(
      (
        result: { [comment_id: string]: HTMLDivElement },
        current: HTMLDivElement
      ) => {
        result[current.getAttribute("comment_id")!] = current;
        return result;
      },
      {}
    );

    const polygon_elements = Array.from(
      document
        .getElementById("comment_svg")!
        .querySelectorAll<SVGPolygonElement>("polygon")
    ).reduce(
      (
        result: { [comment_id: string]: SVGPolygonElement },
        current: SVGPolygonElement
      ) => {
        result[current.getAttribute("comment_id")!] = current;
        return result;
      },
      {}
    );

    this.box_sorted_info = span_element_arr
      .filter((span: HTMLSpanElement[]) => {
        return span.length > 0;
      })
      .map((span: HTMLSpanElement[]) => {
        return {
          comment_id: span[0]!.getAttribute("comment_id")!,
          first_span: span[0]!,
          div: div_elements[span[0]!.getAttribute("comment_id")!]!,
          polygon: polygon_elements[span[0]!.getAttribute("comment_id")!]!,
        };
      });
  };

  // sort関数で生成されたthis.box_sorted_infoに従って、comment_boxのy方向の位置を調整
  // （comment_boxのinputイベントなどではsortの必要がないため、arrange部分だけ別関数として作成）
  arrange = (start_comment_id?: string) => {
    for (let i = 0; i < this.box_sorted_info.length; i++) {
      let pos_prev = 0;
      if (i > 0) {
        pos_prev =
          this.box_sorted_info[i - 1]!.div.offsetTop +
          this.box_sorted_info[i - 1]!.div.offsetHeight;
      }

      this.box_sorted_info[i]!.div.style.top = `${Math.max(
        pos_prev + 10,
        parseInt(
          this.box_sorted_info[i]!.first_span.getAttribute("offset_top")!
        )
      )}px`;
      this.box_sorted_info[i]!.polygon.setAttribute(
        "points",
        `0 ${
          Number(
            this.box_sorted_info[i]!.first_span.getAttribute("offset_top")
          ) + 8
        }, 15 ${this.box_sorted_info[i]!.div.offsetTop + 5}, 15 ${
          this.box_sorted_info[i]!.div.offsetTop + 30
        }`
      );
    }
  };
}

class SatTazumen {
  sat: Sat;
  fugo_dic: { [fugo: string]: string } = {};

  constructor(sat: Sat) {
    this.sat = sat;
  }

  extractFugo_ja = (text: string): void => {
    // let sentence = document.getElementById("content").innerText;

    // 段落０００１以降の文章に（可能であれば）限定
    let mt = text.match(/[【［\[](0001|０００１)[】］\]]/);
    if (mt) {
      text = text.substring(mt.index!);
    }

    //取得するパターンを定義。文字種別で雑にたくさん拾ってくる
    let re_jp =
      /([一-龠ア-ンァ-ヶＡ-Ｚー]{2,20})([0-9０-９]{1,4})([a-zａ-ｚA-ZＡ-Ｚ]{0,3})/gi;
    //除外するパターンを定義。縦棒は半角なので、全角が入らないように注意
    let re_anti_jp =
      /([実施|実施例|比較例|従来例|形態|請求項|特開|平成|昭和|変形例|手続補正|第|該|当該|変形例|前記|上記|特許|国際公開|図|乃至|特許文献|丁目|ＪＰ|ＵＳ|ＷＯ|ＤＥ]{1,20})([0-9０-９]{0,4})([a-zａ-ｚA-ZＡ-Ｚ]{0,3})/gi;

    let result = text.match(re_jp);
    let u_result = this.removeRep(result);
    let result_sort = u_result.sort(this.CompareForSort);

    let anti_result = text.match(re_anti_jp);
    let u_anti_result = this.removeRep(anti_result);
    let anti_sort_result = u_anti_result.sort(this.CompareForSort);

    let diff_result = this.diffArray(result_sort, anti_sort_result);

    let words = diff_result;

    this.fugo_dic = {};
    words.forEach((word) => {
      let mt = word.match(/([0-9０-９]{1,4})([a-zａ-ｚA-ZＡ-Ｚ]{0,3})/);
      let name = word.substring(0, mt.index);
      let num = this.zen2Han(word.substring(mt.index));
      this.fugo_dic[num] = name;
    });
  };

  removeRep = (ary: any) => {
    //unique配列にする
    let temp: any = {},
      res = [];
    for (let i = 0; i < ary.length; i++) temp[ary[i]] = i;
    for (let key in temp) res.push(key);
    return res;
  };

  diffArray = (arr1: any, arr2: any) => {
    //配列の差分
    var newArr = [];
    for (var a = 0; a < arr1.length; a++) {
      if (arr2.indexOf(arr1[a]) === -1) {
        newArr.push(arr1[a]);
      }
    }
    return newArr;
  };

  CompareForSort = (first: any, second: any) => {
    //昇順
    if (first == second) return 0;
    if (first < second) return -1;
    else return 1;
  };

  zen2Han = (strVal: string) => {
    //文字列を全角から半角にする
    var halfVal = strVal.replace(/[！-～]/g, function (tmpStr) {
      // 文字コードをシフト
      return String.fromCharCode(tmpStr.charCodeAt(0) - 0xfee0);
    });

    // 文字コードシフトで対応できない文字の変換
    return halfVal
      .replace(/”/g, '"')
      .replace(/’/g, "'")
      .replace(/‘/g, "`")
      .replace(/￥/g, "\\")
      .replace(/　/g, " ");
  };
}
