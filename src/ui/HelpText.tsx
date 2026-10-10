import type { Balance } from '@/game/balance';

import { CoinBagIcon, UpArrowIcon } from './icons';

/** あそびかた（CPU 戦・2 人対戦で共通）。「長くて分からない」という指摘で、1 項目 1〜2 文に絞った。 */
export function HelpText({ balance }: { balance: Balance }) {
  return (
    <div className="help-list">
      <p className="sheet-text">
        <b>勝ち方</b>: カードでコインを稼ぎ、物件を建てて VP（勝利点）を集めます。10 件すべてが建つか、
        ターンが尽きたら VP の多いほうの勝ち。
      </p>
      <p className="sheet-text">
        <b>カード</b>: 盤面へ<b>ドラッグ</b>して使います。<b>長押し</b>で説明。使った札だけが山の底へ回り、
        左下の「次」の札が入ります。採掘師・銀行家のコインは<b>次の収入</b>（自分の次のターンの始め）に入ります。
      </p>
      <p className="sheet-text">
        <b>物件の数字</b>: 空き地は建設費。建った物件は{' '}
        <span className="help-fig plot-value">
          <CoinBagIcon />
          買収に要るコイン
        </span>{' '}
        と{' '}
        <span className="help-fig plot-upgrade">
          <UpArrowIcon />
          アップグレード費
        </span>
        。物件をタップすると、建てる・上げる・相手の物件を買収する（代金は相手に渡る）ができます。
      </p>
      <p className="sheet-text">
        <b>地区</b>: 盤面は{balance.districts.map((d) => d.name).join('・')}の 3 地区。端の名札の数字は
        件数（自分 対 相手）で、多く持つ側に<b>称号 +{balance.districtTitleVp} VP</b>。同数なら今の持ち主のまま。
      </p>
      <p className="sheet-text">
        <b>街道</b>: 自分の街道をタップすると、手札の札を 1 枚山の底へ送れます（次のターンの手札を選べる）。
      </p>
      <p className="sheet-text">演出が遅いと感じたら、設定の「早送り」。盤面に触れると今の演出を飛ばせます。</p>
    </div>
  );
}
