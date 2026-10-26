import type { Channel, Coord } from '../world/types'
import type { Attitude, Goal, NeedKey } from './types'

/** 共享事实 id：不同角色各持一个版本，开局就存在版本差。 */
export const INFO = {
  barrier: 'barrier',
  basement: 'basement-experiment',
  transfer: 'transfer-student',
  bell: 'midnight-bell',
  missing: 'missing-student',
} as const

export type AbilityStateName = '稳定' | '亢进' | '暴走' | '封印'

export interface AbilitySeed {
  name: string
  description: string
  /** 1–5 */
  level: number
  /** 0–100 负荷 */
  charge: number
  state: AbilityStateName
  /** 代价或限制 */
  limit: string
}

export interface SeedEntry {
  infoId: string
  content: string
  gist?: string
  topics: string[]
}

export interface CharacterSeed {
  id: string
  name: string
  tint: string
  controller: 'agent' | 'sim'
  initiative: number
  pos: Coord
  ability: AbilitySeed
  persona: string[]
  /** 自我认知与世界观：直接约束行动方向 */
  creed: SeedEntry[]
  facts: SeedEntry[]
  others: SeedEntry[]
  past: SeedEntry[]
  secrets: SeedEntry[]
  rumors: SeedEntry[]
  attitudes: Record<string, Attitude>
  goals: Goal[]
  needs: Record<NeedKey, number>
  attention: Record<string, number>
}

const e = (infoId: string, content: string, topics: string[]): SeedEntry => ({ infoId, content, topics })

/** 开局就铺在庄园里的世界信息。ttl 99 表示整局都在。 */
export interface WorldInfoSeed {
  id: string
  channel: Channel
  strength: number
  at: Coord
  label: string
  ttl: number
}

export const WORLD_INFO: WorldInfoSeed[] = [
  { id: 'wi-gate', channel: 'sound', strength: 600, at: { layer: 1, x: 58, y: 74 }, label: '校门结界的低鸣', ttl: 99 },
  { id: 'wi-hall-notice', channel: 'vision', strength: 800, at: { layer: 1, x: 74, y: 46 }, label: '公告：今日禁止进入旧实验室', ttl: 99 },
  { id: 'wi-library-frost', channel: 'vision', strength: 700, at: { layer: 1, x: 72, y: 24 }, label: '禁书区的书脊上结着霜', ttl: 99 },
  { id: 'wi-corridor-radio', channel: 'sound', strength: 600, at: { layer: 1, x: 90, y: 37 }, label: '广播里断断续续的杂音', ttl: 2 },
  { id: 'wi-kitchen-curry', channel: 'smell', strength: 700, at: { layer: 1, x: 104, y: 24 }, label: '咖喱的味道', ttl: 4 },
  { id: 'wi-infirmary', channel: 'smell', strength: 600, at: { layer: 2, x: 104, y: 24 }, label: '消毒水的味道', ttl: 4 },
  { id: 'wi-attic-badge', channel: 'vision', strength: 700, at: { layer: 3, x: 90, y: 30 }, label: '阁楼里翻倒的旧校徽', ttl: 99 },
  { id: 'wi-cellar-chain', channel: 'sound', strength: 700, at: { layer: 0, x: 100, y: 40 }, label: '地下室传来的锁链声', ttl: 2 },
  { id: 'wi-greenhouse', channel: 'smell', strength: 700, at: { layer: 1, x: 13, y: 12 }, label: '温室里异样的花香', ttl: 6 },
  { id: 'wi-well', channel: 'vision', strength: 700, at: { layer: 1, x: 14, y: 56 }, label: '井边的湿泥脚印', ttl: 99 },
  { id: 'wi-fountain', channel: 'sound', strength: 500, at: { layer: 1, x: 34, y: 52 }, label: '喷泉的水声', ttl: 2 },
  { id: 'wi-dorm-bell', channel: 'sound', strength: 600, at: { layer: 2, x: 75, y: 24 }, label: '宿舍的熄灯铃', ttl: 2 },
]

/** 私立雾影学园：十六名能力者。 */
export const SEEDS: CharacterSeed[] = [
  {
    id: 'kirisame-ren',
    name: '神代 莲',
    tint: '#ffd166',
    controller: 'agent',
    initiative: 100,
    pos: { layer: 1, x: 87, y: 46 },
    ability: { name: '重力', description: '改变视野内物体的受力方向与大小。', level: 4, charge: 20, state: '稳定', limit: '情绪失控时重力会自己动。' },
    persona: [
      '我是学生会长，所有人都在看我。',
      '能力是重力；控制得住别人，也要控制住自己。',
      '这所学校有问题，但我必须先稳住局面。',
    ],
    facts: [
      e('notice', '公告栏写着：今日禁止进入旧实验室。', ['公告', '实验室']),
      e('storm', '暴风雨从傍晚开始，校门的结界一直没有停过低鸣。', ['结界', '校门']),
      e('bell', '每逢午夜，钟楼会响一次，但钟楼早就封了。', ['钟声', '钟楼']),
    ],
    others: [
      e('ren-hino', '火野茜的能力在失控边缘，她需要有人看着。', ['火野', '能力']),
      e('ren-transfer', '橘凉太是这学期唯一的转校生，档案是空白的。', ['橘', '转校生']),
    ],
    past: [
      e('ren-sister', '去年有个学生失踪了，报告是我压下来的。', ['失踪', '往事']),
    ],
    secrets: [
      e('ren-sister-secret', '失踪的那个学生，是我的妹妹。', ['失踪', '秘密']),
    ],
    rumors: [
      e(INFO.barrier, '结界撑不到天亮，校门外的雾已经漫进车道了。', ['结界']),
      e(INFO.basement, '旧实验室的锁被人换过，钥匙不在校方手里。', ['实验室', '钥匙']),
    ],
    creed: [
      e('creed-kirisame-ren-0', '我必须是那个先站出来的人，否则这个学校会散。', ['自我']),
      e('creed-kirisame-ren-1', '我嘴上说秩序，心里想的其实是找到妹妹。', ['自我']),
      e('creed-kirisame-ren-2', '学校不是学校，是九条家筛选能力者的地方。', ['学校', '阴谋']),
      e('creed-kirisame-ren-3', '结界不是保护，是把我们关在里面。', ['结界']),
      e('creed-kirisame-ren-4', '钟声每响一次，就有人被带走。', ['钟声']),
      e('creed-kirisame-ren-5', '任何可能引发恐慌的消息，先压下来。', ['信条']),
      e('creed-kirisame-ren-6', '我不进旧实验室，除非确定妹妹在里面。', ['信条']),
    ],
    attitudes: {
      'kirisame-hino': { stance: '戒备', text: '火野的能力一旦暴走，整层楼都会塌。' },
      'kirisame-transfer': { stance: '戒备', text: '转校生的档案太干净了。' },
      'kirisame-saya': { stance: '亲近', text: '桐生老师是少数还愿意说实话的大人。' },
      'kirisame-shiori': { stance: '畏惧', text: '地下室里那个女孩，让我想起妹妹。' },
    },
    goals: [
      { id: 'order', text: '维持学园秩序，别让学生进实验室', weight: 0.9, status: 'active', target: { layer: 1, x: 87, y: 46 } },
      { id: 'missing', text: '查明去年失踪的真相', weight: 0.6, status: 'active', target: { layer: 0, x: 100, y: 40 } },
    ],
    needs: { safety: 300, status: 700, curiosity: 400 },
    attention: { 结界: 900, 失踪: 800, 实验室: 700, 转校生: 600 },
  },
  {
    id: 'kirisame-mio',
    name: '月岛 澪',
    tint: '#7bdff2',
    controller: 'sim',
    initiative: 80,
    pos: { layer: 1, x: 74, y: 20 },
    ability: { name: '预知梦', description: '睡着时看见未来的碎片。', level: 3, charge: 30, state: '稳定', limit: '只能看见，无法选择看什么。' },
    persona: [
      '我昨晚又梦见那口井。',
      '预知梦不会说谎，但会漏掉最重要的部分。',
      '副会长的工作，就是替会长把梦记下来。',
    ],
    facts: [
      e('mio-dream', '梦里有人在井边埋东西，看不清脸。', ['梦', '井']),
      e('mio-library', '图书馆禁书区的书被人翻过，顺序变了。', ['图书馆', '禁书']),
      e('mio-council', '学生会办公室的保险柜里有一份旧名单。', ['学生会', '名单']),
    ],
    others: [
      e('mio-ren', '会长在瞒着所有人查他妹妹的事。', ['会长', '妹妹']),
      e('mio-yuki', '白鸟能读心，但她从不说自己读到了什么。', ['白鸟', '读心']),
    ],
    past: [
      e('mio-last-dream', '去年失踪那晚，我梦见钟楼响了两次。', ['钟楼', '往事']),
    ],
    secrets: [
      e('mio-list', '我看过那份旧名单，上面有我的名字。', ['名单', '秘密']),
    ],
    rumors: [
      e(INFO.missing, '失踪的学生没有离开学校，她还在某个地方。', ['失踪']),
      e(INFO.bell, '钟楼响第二下的时候，会有人消失。', ['钟声']),
    ],
    creed: [
      e('creed-kirisame-mio-0', '我的梦从来不完整，但我信它。', ['自我']),
      e('creed-kirisame-mio-1', '我梦见的是自己的死，这件事没告诉任何人。', ['自我']),
      e('creed-kirisame-mio-2', '学校在重复十年前的事，只是换了人。', ['学校', '阴谋']),
      e('creed-kirisame-mio-3', '名单是按能力等级排的，不是按成绩。', ['名单']),
      e('creed-kirisame-mio-4', '梦到的事不说出口，就不会成真。', ['信条']),
      e('creed-kirisame-mio-5', '会长需要有人替他把梦记下来。', ['信条', '会长']),
    ],
    attitudes: {
      'kirisame-ren': { stance: '亲近', text: '会长扛了太多，我该分担一点。' },
      'kirisame-yuki': { stance: '戒备', text: '她知道我在想什么，这让我不舒服。' },
      'kirisame-genzo': { stance: '畏惧', text: '学园长看我的眼神，像在确认什么。' },
    },
    goals: [
      { id: 'decode-dream', text: '弄清楚井边的梦是什么意思', weight: 0.8, status: 'active', target: { layer: 1, x: 14, y: 56 } },
      { id: 'protect-ren', text: '别让会长一个人去地下室', weight: 0.6, status: 'active', target: { layer: 1, x: 87, y: 46 } },
    ],
    needs: { safety: 400, status: 300, curiosity: 800 },
    attention: { 梦: 900, 井: 800, 名单: 700, 钟楼: 600 },
  },
  {
    id: 'kirisame-hino',
    name: '火野 茜',
    tint: '#f78c6b',
    controller: 'sim',
    initiative: 90,
    pos: { layer: 1, x: 100, y: 48 },
    ability: { name: '发火', description: '让接触到的物体自燃，或让火焰从掌心喷出。', level: 4, charge: 75, state: '亢进', limit: '体温过高会先灼伤自己。' },
    persona: [
      '别用那种眼神看我，我还没烧过活人。',
      '我的能力很吵，但至少它不会骗我。',
      '会长想把我关起来，我知道。',
    ],
    facts: [
      e('hino-burn', '餐厅的桌角有我上周烧焦的痕迹。', ['餐厅', '火']),
      e('hino-rule', '校规第七条：能力者不得在室内使用能力。', ['校规']),
      e('hino-storm', '暴风雨把操场淹了，正好没人管我。', ['暴风雨']),
    ],
    others: [
      e('hino-ren', '会长压得住我，但我讨厌他那种理所当然。', ['会长']),
      e('hino-rin', '九条玲奈总在旁边看戏，笑得让人发毛。', ['九条']),
    ],
    past: [
      e('hino-first', '第一次能力暴走是在小学，烧掉了一间教室。', ['暴走', '往事']),
    ],
    secrets: [
      e('hino-scar', '我手臂上的烧伤不是意外，是有人逼我用的。', ['烧伤', '秘密']),
    ],
    rumors: [
      e(INFO.transfer, '转校生存档案里写着“能力：无”，骗谁呢。', ['转校生']),
      e(INFO.bell, '钟声一响，火就会自己烧起来。', ['钟声', '火']),
    ],
    creed: [
      e('creed-kirisame-hino-0', '我知道自己危险，但我不是怪物。', ['自我']),
      e('creed-kirisame-hino-1', '烧东西的时候，世界才是安静的。', ['自我']),
      e('creed-kirisame-hino-2', '大人们怕的不是火，是我听不听话。', ['自我', '学校']),
      e('creed-kirisame-hino-3', '九条玲奈想把我当武器用。', ['九条']),
      e('creed-kirisame-hino-4', '谁先动手，我就烧回去。', ['信条']),
      e('creed-kirisame-hino-5', '绝不进地下室，那里的空气会让火失控。', ['信条', '地下室']),
    ],
    attitudes: {
      'kirisame-ren': { stance: '戒备', text: '会长笑的时候，通常是在算账。' },
      'kirisame-rin': { stance: '敌意', text: '九条看我的眼神像在看一只宠物。' },
      'kirisame-kanade': { stance: '亲近', text: '她说会帮我压住温度，我半信半疑。' },
    },
    goals: [
      { id: 'cool-down', text: '别在今晚烧起来', weight: 0.9, status: 'active', target: { layer: 1, x: 34, y: 52 } },
      { id: 'find-scar', text: '查清当年是谁逼我用能力', weight: 0.5, status: 'active', target: { layer: 3, x: 90, y: 30 } },
    ],
    needs: { safety: 600, status: 400, curiosity: 300 },
    attention: { 火: 900, 钟声: 600, 九条: 500, 转校生: 400 },
  },
  {
    id: 'kirisame-yuki',
    name: '白鸟 雪',
    tint: '#c9d6ff',
    controller: 'sim',
    initiative: 60,
    pos: { layer: 1, x: 70, y: 28 },
    ability: { name: '读心', description: '触碰对方时读到最表层的一个念头。', level: 3, charge: 40, state: '稳定', limit: '必须触碰，且会被对方察觉。' },
    persona: [
      '我读到的每个人，都在害怕同一件事。',
      '图书馆是我唯一不用听别人心声的地方。',
      '我不说，不代表我不知道。',
    ],
    facts: [
      e('yuki-forbidden', '禁书区最底层有一本没有书名的册子。', ['禁书', '图书馆']),
      e('yuki-frost', '禁书区的书脊上结着霜，不是天气的原因。', ['霜', '图书馆']),
      e('yuki-key', '图书馆的备用钥匙在学园长那里。', ['钥匙', '学园长']),
    ],
    others: [
      e('yuki-mio', '月岛在想井，想得很用力，像在压住什么。', ['月岛', '井']),
      e('yuki-genzo', '学园长碰到我时，脑子里什么都没有。', ['学园长']),
    ],
    past: [
      e('yuki-first', '第一次读心是在母亲葬礼上，我听见所有人都在算计遗产。', ['读心', '往事']),
    ],
    secrets: [
      e('yuki-book', '那本无名册子里记着历届能力者的死因。', ['册子', '秘密']),
    ],
    rumors: [
      e(INFO.basement, '旧实验室里还留着上一届的实验记录。', ['实验室']),
      e(INFO.missing, '失踪者的名字，在册子的最后一页。', ['失踪', '册子']),
    ],
    creed: [
      e('creed-kirisame-yuki-0', '读心让我知道太多，也让我谁都不信。', ['自我']),
      e('creed-kirisame-yuki-1', '我不说，是因为说出来会更糟。', ['自我']),
      e('creed-kirisame-yuki-2', '学园长读不到，是因为他把自己也封起来了。', ['学园长']),
      e('creed-kirisame-yuki-3', '那本册子记的不是死因，是实验记录。', ['册子', '阴谋']),
      e('creed-kirisame-yuki-4', '先观察，再开口；说出口的话会改变别人。', ['信条']),
      e('creed-kirisame-yuki-5', '碰我之前，先想清楚。', ['信条']),
    ],
    attitudes: {
      'kirisame-mio': { stance: '亲近', text: '月岛梦见的東西，我也在书里见过。' },
      'kirisame-genzo': { stance: '畏惧', text: '读不到的人，比读得到的人可怕。' },
      'kirisame-transfer': { stance: '戒备', text: '转校生的表层念头是一片空白。' },
    },
    goals: [
      { id: 'read-book', text: '读完那本无名册子', weight: 0.8, status: 'active', target: { layer: 1, x: 72, y: 24 } },
      { id: 'warn-mio', text: '提醒月岛别一个人查下去', weight: 0.6, status: 'active', target: { layer: 1, x: 74, y: 20 } },
    ],
    needs: { safety: 500, status: 200, curiosity: 700 },
    attention: { 册子: 900, 读心: 700, 学园长: 600, 井: 500 },
  },
  {
    id: 'kirisame-hayato',
    name: '黑木 隼',
    tint: '#a3bffa',
    controller: 'sim',
    initiative: 85,
    pos: { layer: 1, x: 90, y: 37 },
    ability: { name: '疾风', description: '短距离内把自己加速到肉眼难辨。', level: 3, charge: 25, state: '稳定', limit: '加速后会有几秒听不见声音。' },
    persona: [
      '风纪委员的工作，就是让大家按时回宿舍。',
      '我的能力只够跑一条走廊，但够用了。',
      '今晚的走廊比平时长。',
    ],
    facts: [
      e('hayato-patrol', '我每半小时巡一次走廊和楼梯。', ['巡逻', '走廊']),
      e('hayato-door', '旧实验室的门从里面锁着，钥匙孔被焊死了。', ['实验室', '门']),
      e('hayato-storm', '暴风雨把校门外的车道冲断了。', ['暴风雨', '校门']),
    ],
    others: [
      e('hayato-hino', '火野今晚很安静，安静得不对劲。', ['火野']),
      e('hayato-genzo', '学园长今晚没有出办公室。', ['学园长']),
    ],
    past: [
      e('hayato-race', '去年校运会上，我用能力赢了一场不该赢的比赛。', ['能力', '往事']),
    ],
    secrets: [
      e('hayato-key', '我偷偷配了一把旧实验室的钥匙，还没用过。', ['钥匙', '秘密']),
    ],
    rumors: [
      e(INFO.barrier, '校门的结界撑不到天亮。', ['结界']),
      e(INFO.bell, '午夜钟声后，走廊里会多出一扇门。', ['钟声', '走廊']),
    ],
    creed: [
      e('creed-kirisame-hayato-0', '我跑得快，但我逃不掉。', ['自我']),
      e('creed-kirisame-hayato-1', '我配了那把钥匙，说明我早就想进去。', ['自我']),
      e('creed-kirisame-hayato-2', '旧实验室的门是从里面锁的，里面有人。', ['实验室']),
      e('creed-kirisame-hayato-3', '钟声后出现的那扇门，不是幻觉。', ['钟声']),
      e('creed-kirisame-hayato-4', '巡逻时先看楼梯，不看人脸。', ['信条']),
      e('creed-kirisame-hayato-5', '学生出事，第一个被问的是风纪委员。', ['信条']),
    ],
    attitudes: {
      'kirisame-ren': { stance: '亲近', text: '会长虽然强势，但至少不躲事。' },
      'kirisame-hino': { stance: '戒备', text: '火野今晚的温度能把人烫伤。' },
      'kirisame-shiori': { stance: '戒备', text: '地下室的女孩，不该被放出来。' },
    },
    goals: [
      { id: 'patrol', text: '巡完所有楼梯，确认没人乱走', weight: 0.8, status: 'active', target: { layer: 2, x: 86, y: 44 } },
      { id: 'check-lab', text: '去旧实验室门口再看一眼', weight: 0.5, status: 'active', target: { layer: 0, x: 100, y: 40 } },
    ],
    needs: { safety: 300, status: 400, curiosity: 300 },
    attention: { 巡逻: 800, 实验室: 600, 结界: 500, 钟声: 500 },
  },
  {
    id: 'kirisame-moe',
    name: '绿川 萌',
    tint: '#9ae6b4',
    controller: 'sim',
    initiative: 45,
    pos: { layer: 1, x: 30, y: 62 },
    ability: { name: '植物对话', description: '听见植物的“声音”，让它们缓慢移动。', level: 2, charge: 15, state: '稳定', limit: '只对活着的植物有效。' },
    persona: [
      '温室里的花今晚都在发抖。',
      '植物不会说谎，人会说。',
      '我听见井边的土在喊。',
    ],
    facts: [
      e('moe-greenhouse', '温室的花一夜之间全朝着地下室的方向弯。', ['温室', '花']),
      e('moe-well', '井边的土被人翻过，又盖回去了。', ['井', '土']),
      e('moe-trees', '后院的树上挂着一条旧校服布条。', ['后院', '布条']),
    ],
    others: [
      e('moe-ren', '会长来花园时总是站在井边发呆。', ['会长', '井']),
      e('moe-inukai', '犬饲先生知道井边的事，但他不肯说。', ['犬饲', '井']),
    ],
    past: [
      e('moe-mother', '母亲说，这栋房子以前是个研究所。', ['房子', '往事']),
    ],
    secrets: [
      e('moe-roots', '井下的树根缠着一个铁盒子。', ['井', '秘密']),
    ],
    rumors: [
      e(INFO.basement, '地下室的味道，和温室里那株枯死的花一样。', ['地下室', '花']),
      e(INFO.missing, '去年失踪的女孩，最后出现在温室。', ['失踪', '温室']),
    ],
    creed: [
      e('creed-kirisame-moe-0', '植物不会骗我，人会说谎。', ['自我']),
      e('creed-kirisame-moe-1', '我听见土在喊，但不知道该不该挖。', ['自我', '井']),
      e('creed-kirisame-moe-2', '这栋房子以前是研究所，母亲没骗我。', ['学校']),
      e('creed-kirisame-moe-3', '温室的花朝地下室弯，是下面有东西在呼吸。', ['温室', '地下室']),
      e('creed-kirisame-moe-4', '不踩活着的根。', ['信条']),
      e('creed-kirisame-moe-5', '谁动井边的土，我就跟谁急。', ['信条', '井']),
    ],
    attitudes: {
      'kirisame-inukai': { stance: '亲近', text: '犬饲先生照顾花园，也照顾我。' },
      'kirisame-ren': { stance: '戒备', text: '会长看井的眼神，和看人不一样。' },
      'kirisame-shiori': { stance: '畏惧', text: '那个女孩身上没有活物的味道。' },
    },
    goals: [
      { id: 'protect-garden', text: '让温室的花安静下来', weight: 0.7, status: 'active', target: { layer: 1, x: 13, y: 12 } },
      { id: 'dig-well', text: '把井下的铁盒挖出来', weight: 0.6, status: 'active', target: { layer: 1, x: 14, y: 56 } },
    ],
    needs: { safety: 400, status: 100, curiosity: 600 },
    attention: { 花: 900, 井: 800, 铁盒: 600, 地下室: 500 },
  },
  {
    id: 'kirisame-transfer',
    name: '橘 凉太',
    tint: '#8fd3ff',
    controller: 'sim',
    initiative: 70,
    pos: { layer: 1, x: 84, y: 52 },
    ability: { name: '时间减速', description: '在自己周围制造一小片慢下来的时间。', level: 5, charge: 0, state: '封印', limit: '解开封印会引来“那个东西”。' },
    persona: [
      '我是转校生，档案是空的，这样最省事。',
      '我的能力被封印了，但封印不是永久的。',
      '这栋房子我来过，在很久以前。',
    ],
    facts: [
      e('transfer-file', '转校档案上“能力”一栏写着“无”。', ['档案', '能力']),
      e('transfer-gate', '校门的结界在我进校时闪了一下。', ['结界', '校门']),
      e('transfer-bell', '午夜钟声响起时，我的封印会松动。', ['钟声', '封印']),
    ],
    others: [
      e('transfer-ren', '会长在查我的档案，他迟早会查到。', ['会长', '档案']),
      e('transfer-genzo', '学园长认识我，尽管我们没见过。', ['学园长']),
    ],
    past: [
      e('transfer-before', '十年前，我在这栋房子里失去过一个人。', ['往事', '房子']),
    ],
    secrets: [
      e('transfer-seal', '封印是我自己下的，为了不让自己再回去。', ['封印', '秘密']),
    ],
    rumors: [
      e(INFO.transfer, '转校生不是第一次来这所学校。', ['转校生']),
      e(INFO.bell, '钟声每响一次，封印就薄一层。', ['钟声', '封印']),
    ],
    creed: [
      e('creed-kirisame-transfer-0', '我回来不是救人，是确认她还在。', ['自我']),
      e('creed-kirisame-transfer-1', '封印是我自己下的，解开它我不后悔，但会害怕。', ['自我', '封印']),
      e('creed-kirisame-transfer-2', '十年前那场实验没有失败，只是被藏起来了。', ['实验', '阴谋']),
      e('creed-kirisame-transfer-3', '学园长认识我，说明他当年在场。', ['学园长']),
      e('creed-kirisame-transfer-4', '午夜前不碰封印，除非有人先破坏它。', ['信条', '封印']),
      e('creed-kirisame-transfer-5', '不信任任何自称大人的能力者。', ['信条']),
    ],
    attitudes: {
      'kirisame-ren': { stance: '戒备', text: '会长的问题太直接了。' },
      'kirisame-shiori': { stance: '畏惧', text: '地下室那个女孩，我认识。' },
      'kirisame-genzo': { stance: '敌意', text: '他知道十年前发生了什么。' },
    },
    goals: [
      { id: 'keep-seal', text: '别在午夜前解开封印', weight: 0.9, status: 'active', target: { layer: 1, x: 84, y: 52 } },
      { id: 'find-past', text: '找到十年前那件事的记录', weight: 0.6, status: 'active', target: { layer: 0, x: 100, y: 40 } },
    ],
    needs: { safety: 700, status: 200, curiosity: 500 },
    attention: { 封印: 900, 钟声: 800, 地下室: 700, 学园长: 600 },
  },
  {
    id: 'kirisame-kanade',
    name: '蓝原 奏',
    tint: '#8fe3c8',
    controller: 'sim',
    initiative: 65,
    pos: { layer: 2, x: 100, y: 46 },
    ability: { name: '治愈', description: '让伤口以肉眼可见的速度闭合。', level: 3, charge: 35, state: '稳定', limit: '治好别人时，会分担对方的痛。' },
    persona: [
      '保健委员的工作，是先让自己不抖。',
      '我能治好伤口，治不好害怕。',
      '今晚来医务室的人，都不是因为受伤。',
    ],
    facts: [
      e('kanade-infirmary', '医务室的消毒水快用完了。', ['医务室']),
      e('kanade-list', '今晚来登记的学生，比平时少了一半。', ['登记', '学生']),
      e('kanade-hino', '火野的手上有旧烧伤，不像意外。', ['火野', '烧伤']),
    ],
    others: [
      e('kanade-hino', '火野在硬撑，她的体温已经不正常了。', ['火野']),
      e('kanade-todo', '藤堂医生知道一些事，但她不说。', ['藤堂']),
    ],
    past: [
      e('kanade-brother', '我哥哥也是能力者，他没能撑过暴走。', ['哥哥', '往事']),
    ],
    secrets: [
      e('kanade-pill', '我藏了一瓶抑制能力的药，来自旧实验室。', ['药', '秘密']),
    ],
    rumors: [
      e(INFO.basement, '旧实验室里有一种能压住能力的药。', ['实验室', '药']),
      e(INFO.barrier, '结界失效时，所有人的能力都会失控。', ['结界', '能力']),
    ],
    creed: [
      e('creed-kirisame-kanade-0', '我治得好伤口，治不好自己心里的害怕。', ['自我']),
      e('creed-kirisame-kanade-1', '哥哥死的时候我在场，我没救他。', ['自我', '往事']),
      e('creed-kirisame-kanade-2', '抑制药不是学校发的，是有人私自带进来的。', ['药', '阴谋']),
      e('creed-kirisame-kanade-3', '藤堂医生知道药从哪来。', ['藤堂']),
      e('creed-kirisame-kanade-4', '先救人，再问对错。', ['信条']),
      e('creed-kirisame-kanade-5', '不把最后一瓶药给任何大人。', ['信条']),
    ],
    attitudes: {
      'kirisame-hino': { stance: '亲近', text: '火野需要有人告诉她，不用一直烧着。' },
      'kirisame-todo': { stance: '戒备', text: '藤堂医生给我的药，来路不明。' },
      'kirisame-ren': { stance: '中立', text: '会长把所有人都当成问题处理。' },
    },
    goals: [
      { id: 'calm-hino', text: '让火野的温度降下来', weight: 0.8, status: 'active', target: { layer: 1, x: 100, y: 48 } },
      { id: 'find-pill', text: '确认那瓶药的来源', weight: 0.5, status: 'active', target: { layer: 2, x: 104, y: 24 } },
    ],
    needs: { safety: 500, status: 200, curiosity: 500 },
    attention: { 火野: 800, 药: 700, 医务室: 600, 旧实验室: 500 },
  },
  {
    id: 'kirisame-hikaru',
    name: '星野 光',
    tint: '#f6d365',
    controller: 'sim',
    initiative: 50,
    pos: { layer: 2, x: 86, y: 44 },
    ability: { name: '声波', description: '把声音聚焦成一束，传到很远的地方。', level: 3, charge: 50, state: '亢进', limit: '使用时会暴露自己的位置。' },
    persona: [
      '广播部的人，最擅长听见别人听不见的。',
      '今晚的杂音里，有人在数数。',
      '我的声音能传很远，但传不进地下室。',
    ],
    facts: [
      e('hikaru-radio', '广播设备在走廊尽头，今晚一直有杂音。', ['广播', '走廊']),
      e('hikaru-count', '杂音里有人在数“一、二、三、四”。', ['数数', '杂音']),
      e('hikaru-dorm', '宿舍的熄灯铃比平时早了十分钟。', ['宿舍', '铃']),
    ],
    others: [
      e('hikaru-chinatsu', '宿舍长在挨个房间点名，像在找谁。', ['宿舍长']),
      e('hikaru-rin', '九条玲奈今晚戴着耳机，什么都不听。', ['九条']),
    ],
    past: [
      e('hikaru-broadcast', '去年失踪那晚，广播里也响过这段杂音。', ['广播', '往事']),
    ],
    secrets: [
      e('hikaru-record', '我录下了那段杂音，倒放是一句话。', ['录音', '秘密']),
    ],
    rumors: [
      e(INFO.bell, '钟楼响第二下的时候，会有人消失。', ['钟声', '杂音']),
      e(INFO.missing, '失踪的学生最后的声音，是从广播里传出来的。', ['失踪', '广播']),
    ],
    creed: [
      e('creed-kirisame-hikaru-0', '我听见的声音比谁都多，所以我知道自己在被监视。', ['自我']),
      e('creed-kirisame-hikaru-1', '广播是我的武器，也是我的暴露。', ['自我']),
      e('creed-kirisame-hikaru-2', '杂音里的数数，是在给钟声倒计时。', ['钟声', '杂音']),
      e('creed-kirisame-hikaru-3', '学园长的广播线是单独接的，他在听什么。', ['学园长']),
      e('creed-kirisame-hikaru-4', '先录下来，再说话。', ['信条']),
      e('creed-kirisame-hikaru-5', '钟声响之前，必须把录音放出去。', ['信条', '钟声']),
    ],
    attitudes: {
      'kirisame-chinatsu': { stance: '亲近', text: '宿舍长在找人，我可以帮她。' },
      'kirisame-rin': { stance: '戒备', text: '九条不听，是因为她早就知道。' },
      'kirisame-genzo': { stance: '畏惧', text: '学园长办公室的广播线是单独接的。' },
    },
    goals: [
      { id: 'decode-noise', text: '把杂音倒放，听清那句话', weight: 0.9, status: 'active', target: { layer: 2, x: 86, y: 44 } },
      { id: 'warn-dorm', text: '告诉宿舍长今晚别点名', weight: 0.5, status: 'active', target: { layer: 2, x: 75, y: 24 } },
    ],
    needs: { safety: 400, status: 300, curiosity: 800 },
    attention: { 杂音: 900, 钟声: 700, 录音: 600, 宿舍: 400 },
  },
  {
    id: 'kirisame-genzo',
    name: '榊 源三',
    tint: '#b8a88a',
    controller: 'sim',
    initiative: 95,
    pos: { layer: 1, x: 92, y: 20 },
    ability: { name: '记忆回溯', description: '触碰物体，看见它经历过的一段过去。', level: 4, charge: 10, state: '封印', limit: '每用一次，会忘掉自己的一段记忆。' },
    persona: [
      '这栋房子比你们所有人都老。',
      '我知道地下室有什么，所以我封了它。',
      '有些记忆，忘了比记着好。',
    ],
    facts: [
      e('genzo-lab', '旧实验室的封印是我亲手加的。', ['实验室', '封印']),
      e('genzo-bell', '钟楼不是钟楼，是旧研究所的信号塔。', ['钟楼', '研究所']),
      e('genzo-list', '学生会的保险柜里有一份历届名单。', ['名单', '学生会']),
    ],
    others: [
      e('genzo-ren', '会长在查他妹妹，他迟早会查到我这。', ['会长']),
      e('genzo-transfer', '转校生的脸，我十年前见过。', ['转校生']),
    ],
    past: [
      e('genzo-ten-years', '十年前的那场实验，是我签的字。', ['实验', '往事']),
    ],
    secrets: [
      e('genzo-shiori', '地下室的女孩不是学生，是实验的产物。', ['地下室', '秘密']),
    ],
    rumors: [
      e(INFO.basement, '实验室里关着的东西，不该被叫醒。', ['实验室']),
      e(INFO.bell, '钟声不是报时，是在给结界供电。', ['钟声', '结界']),
    ],
    creed: [
      e('creed-kirisame-genzo-0', '我封住地下室，是因为我打开过它。', ['自我', '地下室']),
      e('creed-kirisame-genzo-1', '每用一次能力，我就少记得一点自己是谁。', ['自我', '能力']),
      e('creed-kirisame-genzo-2', '结界不是保护学生，是维持实验场。', ['结界', '阴谋']),
      e('creed-kirisame-genzo-3', '钟楼是信号塔，给地下的东西供电。', ['钟楼']),
      e('creed-kirisame-genzo-4', '封印不能开，哪怕会长跪下来求我。', ['信条', '封印']),
      e('creed-kirisame-genzo-5', '学生可以牺牲，实验不能失控。', ['信条']),
    ],
    attitudes: {
      'kirisame-ren': { stance: '戒备', text: '会长太像他母亲了。' },
      'kirisame-transfer': { stance: '畏惧', text: '他不该回来。' },
      'kirisame-shiori': { stance: '畏惧', text: '她每醒一次，结界就薄一层。' },
    },
    goals: [
      { id: 'keep-seal', text: '维持地下室的封印到天亮', weight: 0.9, status: 'active', target: { layer: 0, x: 100, y: 40 } },
      { id: 'stop-ren', text: '阻止会长继续查下去', weight: 0.6, status: 'active', target: { layer: 1, x: 87, y: 46 } },
    ],
    needs: { safety: 600, status: 500, curiosity: 200 },
    attention: { 封印: 900, 结界: 800, 转校生: 700, 会长: 600 },
  },
  {
    id: 'kirisame-saya',
    name: '桐生 沙耶',
    tint: '#c9b3ff',
    controller: 'sim',
    initiative: 88,
    pos: { layer: 1, x: 96, y: 28 },
    ability: { name: '结界', description: '在指定区域张开一层透明的屏障。', level: 4, charge: 60, state: '亢进', limit: '屏障越大，维持时间越短。' },
    persona: [
      '我是班主任，今晚要带所有人活到天亮。',
      '结界能挡住外面的雾，挡不住里面的东西。',
      '校长的命令，我只听一半。',
    ],
    facts: [
      e('saya-barrier', '校门的结界和我的能力同源。', ['结界', '校门']),
      e('saya-class', '今晚点名少了三个人。', ['点名', '学生']),
      e('saya-lab', '旧实验室的门从内侧被焊死，不是从外侧。', ['实验室', '门']),
    ],
    others: [
      e('saya-ren', '会长在硬撑，他的手一直在抖。', ['会长']),
      e('saya-genzo', '学园长今晚不会出办公室，他在守什么。', ['学园长']),
    ],
    past: [
      e('saya-student', '十年前，我也是这所学校的学生。', ['学生', '往事']),
    ],
    secrets: [
      e('saya-seal', '校门的结界是我维持的，我已经快撑不住了。', ['结界', '秘密']),
    ],
    rumors: [
      e(INFO.barrier, '结界撑不到天亮，校门外的雾已经漫进车道了。', ['结界', '钟楼']),
      e(INFO.basement, '实验室的封印需要两个人的能力才能打开。', ['实验室', '封印']),
    ],
    creed: [
      e('creed-kirisame-saya-0', '我是老师，但我首先得让这些孩子活下来。', ['自我']),
      e('creed-kirisame-saya-1', '结界快撑不住了，这件事我没告诉任何人。', ['自我', '结界']),
      e('creed-kirisame-saya-2', '学校在拿学生做实验，我当年也是样本。', ['学校', '阴谋']),
      e('creed-kirisame-saya-3', '九条家要的不是成绩，是数据。', ['九条']),
      e('creed-kirisame-saya-4', '先保学生，再保学校。', ['信条']),
      e('creed-kirisame-saya-5', '必要时，我会打破校规。', ['信条']),
    ],
    attitudes: {
      'kirisame-ren': { stance: '亲近', text: '他是唯一还在做事的学生。' },
      'kirisame-genzo': { stance: '戒备', text: '他让我维持结界，却不说为什么。' },
      'kirisame-hino': { stance: '亲近', text: '火野的热量能帮上忙，如果她撑得住。' },
    },
    goals: [
      { id: 'hold-barrier', text: '撑住校门结界', weight: 0.9, status: 'active', target: { layer: 1, x: 58, y: 74 } },
      { id: 'count-students', text: '找到少掉的三个人', weight: 0.6, status: 'active', target: { layer: 2, x: 75, y: 24 } },
    ],
    needs: { safety: 700, status: 400, curiosity: 300 },
    attention: { 结界: 900, 学生: 700, 封印: 600, 钟楼: 500 },
  },
  {
    id: 'kirisame-rei',
    name: '冰室 玲',
    tint: '#9bd7f5',
    controller: 'sim',
    initiative: 55,
    pos: { layer: 2, x: 92, y: 20 },
    ability: { name: '冰', description: '让水汽凝结成冰，封住门窗或地面。', level: 3, charge: 30, state: '稳定', limit: '温度越低，自己越难动。' },
    persona: [
      '书记的工作是记录，不是判断。',
      '我把每一件事都写下来，包括不该写的。',
      '今晚的记录，可能会成为遗书。',
    ],
    facts: [
      e('rei-minutes', '学生会的会议记录里，去年的条目被撕掉了三页。', ['记录', '学生会']),
      e('rei-ice', '图书馆的霜是我的能力留下的，为了封住禁书区。', ['霜', '禁书']),
      e('rei-list', '旧名单上有一半的名字被划掉了。', ['名单']),
    ],
    others: [
      e('rei-ren', '会长让我销毁三页记录，我没照做。', ['会长', '记录']),
      e('rei-yuki', '白鸟在查同一本册子，我们最好合作。', ['白鸟']),
    ],
    past: [
      e('rei-first', '第一次用冰，是把欺负我的人冻在走廊里。', ['冰', '往事']),
    ],
    secrets: [
      e('rei-copy', '那三页记录我抄了一份，藏在冰里。', ['记录', '秘密']),
    ],
    rumors: [
      e(INFO.missing, '被划掉的名字里，有一个还在学校里。', ['失踪', '名单']),
      e(INFO.bell, '钟声每响一次，名单上就少一个名字。', ['钟声', '名单']),
    ],
    creed: [
      e('creed-kirisame-rei-0', '我记录一切，因为只有文字不会背叛我。', ['自我']),
      e('creed-kirisame-rei-1', '我抄下那三页，是因为我怕自己也会被划掉。', ['自我', '记录']),
      e('creed-kirisame-rei-2', '被划掉的名字不是死了，是被转移了。', ['名单', '阴谋']),
      e('creed-kirisame-rei-3', '会长销毁记录，是在保护名单上的人。', ['会长', '记录']),
      e('creed-kirisame-rei-4', '记录可以藏，但不能改。', ['信条']),
      e('creed-kirisame-rei-5', '只和能交换情报的人合作。', ['信条']),
    ],
    attitudes: {
      'kirisame-ren': { stance: '戒备', text: '会长想保护所有人，却不肯说真话。' },
      'kirisame-yuki': { stance: '亲近', text: '她知道册子的事，我可以信她一次。' },
      'kirisame-genzo': { stance: '畏惧', text: '他让我销毁记录时，手没有抖。' },
    },
    goals: [
      { id: 'save-record', text: '保住那三页记录', weight: 0.8, status: 'active', target: { layer: 2, x: 92, y: 20 } },
      { id: 'meet-yuki', text: '和白鸟交换情报', weight: 0.5, status: 'active', target: { layer: 1, x: 70, y: 28 } },
    ],
    needs: { safety: 500, status: 300, curiosity: 600 },
    attention: { 记录: 900, 名单: 700, 白鸟: 500, 钟声: 400 },
  },
  {
    id: 'kirisame-ryunosuke',
    name: '灰谷 龙之介',
    tint: '#b0b7c3',
    controller: 'sim',
    initiative: 75,
    pos: { layer: 3, x: 90, y: 30 },
    ability: { name: '硬化', description: '让皮肤短时间变得像石头一样硬。', level: 3, charge: 45, state: '亢进', limit: '硬化时无法快速移动。' },
    persona: [
      '阁楼是我的地盘，谁上来谁倒霉。',
      '我不怕能力，我怕的是能力没用的时候。',
      '这栋楼里，我只信自己的拳头。',
    ],
    facts: [
      e('ryu-attic', '阁楼里堆着旧校舍的牌子，还有一箱档案。', ['阁楼', '档案']),
      e('ryu-badge', '旧校徽背面刻着一串编号。', ['校徽', '编号']),
      e('ryu-stairs', '通往阁楼的楼梯有一级是空的。', ['楼梯', '阁楼']),
    ],
    others: [
      e('ryu-hino', '火野和我打过一架，谁也没赢。', ['火野']),
      e('ryu-transfer', '转校生身上有股旧楼的味道。', ['转校生']),
    ],
    past: [
      e('ryu-brother', '我哥是上一届的学生，毕业那天没走出校门。', ['哥哥', '往事']),
    ],
    secrets: [
      e('ryu-file', '档案箱里有我哥的退学记录，日期是假的。', ['档案', '秘密']),
    ],
    rumors: [
      e(INFO.basement, '地下室关着的东西，会叫人的名字。', ['地下室']),
      e(INFO.missing, '失踪的人没有死，他们在墙里。', ['失踪', '墙']),
    ],
    creed: [
      e('creed-kirisame-ryunosuke-0', '我硬得像石头，可我哥的事一直压着我。', ['自我', '哥哥']),
      e('creed-kirisame-ryunosuke-1', '我不信任何解释，只信档案。', ['自我']),
      e('creed-kirisame-ryunosuke-2', '退学记录是假的，我哥没离开过学校。', ['档案', '阴谋']),
      e('creed-kirisame-ryunosuke-3', '墙里有声音，学校把东西砌进去了。', ['墙', '阴谋']),
      e('creed-kirisame-ryunosuke-4', '先动手，再问。', ['信条']),
      e('creed-kirisame-ryunosuke-5', '学园长的话，一个字都不信。', ['信条']),
    ],
    attitudes: {
      'kirisame-hino': { stance: '亲近', text: '火野至少不装。' },
      'kirisame-ren': { stance: '敌意', text: '会长把退学记录当成处理品。' },
      'kirisame-genzo': { stance: '敌意', text: '我哥的档案是他签的。' },
    },
    goals: [
      { id: 'open-box', text: '打开阁楼的档案箱', weight: 0.8, status: 'active', target: { layer: 3, x: 90, y: 30 } },
      { id: 'ask-genzo', text: '找学园长问清楚我哥的事', weight: 0.6, status: 'active', target: { layer: 1, x: 92, y: 20 } },
    ],
    needs: { safety: 400, status: 500, curiosity: 400 },
    attention: { 档案: 900, 哥哥: 800, 校徽: 600, 会长: 500 },
  },
  {
    id: 'kirisame-chinatsu',
    name: '白石 千夏',
    tint: '#ffd6e0',
    controller: 'sim',
    initiative: 40,
    pos: { layer: 2, x: 75, y: 24 },
    ability: { name: '照明', description: '让掌心发出稳定的白光。', level: 2, charge: 20, state: '稳定', limit: '光越亮，自己越看不见暗处。' },
    persona: [
      '宿舍长要确保每个人都在床上。',
      '今晚有三张床是空的。',
      '我不怕黑，我怕名字对不上人。',
    ],
    facts: [
      e('chinatsu-roll', '点名册上今晚少了三个人：橘、灰谷、雨宫。', ['点名', '宿舍']),
      e('chinatsu-bell', '熄灯铃比平时早了十分钟。', ['铃', '宿舍']),
      e('chinatsu-window', '宿舍的窗户从外面被画了一个记号。', ['窗户', '记号']),
    ],
    others: [
      e('chinatsu-hikaru', '星野说广播里有数数的声音。', ['星野', '广播']),
      e('chinatsu-ryu', '灰谷不在阁楼，他的床是冷的。', ['灰谷']),
    ],
    past: [
      e('chinatsu-last-year', '去年我也是宿舍长，失踪那晚我在值班。', ['宿舍长', '往事']),
    ],
    secrets: [
      e('chinatsu-key', '宿舍后门的钥匙只有我有，昨晚被人动过。', ['钥匙', '秘密']),
    ],
    rumors: [
      e(INFO.missing, '去年失踪的学生，也是从宿舍不见的。', ['失踪', '宿舍']),
      e(INFO.bell, '熄灯铃提前，是为了让钟声听起来像正常的。', ['钟声', '铃']),
    ],
    creed: [
      e('creed-kirisame-chinatsu-0', '我是宿舍长，少一个人就是我的错。', ['自我']),
      e('creed-kirisame-chinatsu-1', '去年那晚我在值班，我听见了钟声，但我没出去。', ['自我', '往事']),
      e('creed-kirisame-chinatsu-2', '熄灯铃提前，是为了掩盖钟声。', ['钟声', '铃']),
      e('creed-kirisame-chinatsu-3', '窗户上的记号，是里面的人画的。', ['窗户', '阴谋']),
      e('creed-kirisame-chinatsu-4', '点名必须对得上人。', ['信条']),
      e('creed-kirisame-chinatsu-5', '绝不让学生单独留在走廊。', ['信条']),
    ],
    attitudes: {
      'kirisame-hikaru': { stance: '亲近', text: '星野能听见我听不见的，我需要她。' },
      'kirisame-ryunosuke': { stance: '戒备', text: '灰谷不在床上，也不在阁楼。' },
      'kirisame-ren': { stance: '中立', text: '会长让我别声张，但我做不到。' },
    },
    goals: [
      { id: 'find-missing', text: '找到三个不在床上的学生', weight: 0.9, status: 'active', target: { layer: 2, x: 86, y: 44 } },
      { id: 'guard-dorm', text: '守住宿舍后门', weight: 0.6, status: 'active', target: { layer: 2, x: 75, y: 24 } },
    ],
    needs: { safety: 700, status: 300, curiosity: 400 },
    attention: { 学生: 900, 点名: 800, 后门: 600, 钟声: 500 },
  },
  {
    id: 'kirisame-todo',
    name: '藤堂 静',
    tint: '#d7c4a3',
    controller: 'sim',
    initiative: 58,
    pos: { layer: 2, x: 104, y: 24 },
    ability: { name: '精神安定', description: '让接触者的恐惧短暂平息。', level: 3, charge: 25, state: '稳定', limit: '只压得住恐惧，压不住真相。' },
    persona: [
      '校医的职责是让人冷静，不是让人闭嘴。',
      '今晚来医务室的人，都在问同一件事。',
      '我知道的比我说出来的多。',
    ],
    facts: [
      e('todo-meds', '医务室的药柜里少了一瓶抑制药。', ['药', '医务室']),
      e('todo-record', '去年的体检记录里，有三个学生的能力等级被改过。', ['体检', '记录']),
      e('todo-lab', '旧实验室的钥匙，学园长给过我一把。', ['钥匙', '实验室']),
    ],
    others: [
      e('todo-kanade', '蓝原在藏那瓶药，我装作没看见。', ['蓝原', '药']),
      e('todo-genzo', '学园长让我别管今晚的事。', ['学园长']),
    ],
    past: [
      e('todo-ten', '十年前，我在这栋楼里做过实习生。', ['实习', '往事']),
    ],
    secrets: [
      e('todo-truth', '那场实验的负责人不是学园长，是我。', ['实验', '秘密']),
    ],
    rumors: [
      e(INFO.basement, '地下室的封印，需要“记忆回溯”才能打开。', ['地下室', '封印']),
      e(INFO.barrier, '结界失效不是意外，是有人在抽它的力。', ['结界']),
    ],
    creed: [
      e('creed-kirisame-todo-0', '我治得了恐惧，治不了自己的愧疚。', ['自我']),
      e('creed-kirisame-todo-1', '十年前那场实验，签字的人是我。', ['自我', '实验']),
      e('creed-kirisame-todo-2', '学园长在替我背锅，他知道真相。', ['学园长']),
      e('creed-kirisame-todo-3', '地下室那个女孩，是唯一成功的样本。', ['地下室', '雨宫']),
      e('creed-kirisame-todo-4', '压下真相，是为了让更多人活。', ['信条']),
      e('creed-kirisame-todo-5', '不让任何学生靠近旧实验室。', ['信条']),
    ],
    attitudes: {
      'kirisame-genzo': { stance: '亲近', text: '他替我背了十年的锅，我欠他。' },
      'kirisame-kanade': { stance: '戒备', text: '她手里的药，会让她也成为目标。' },
      'kirisame-shiori': { stance: '畏惧', text: '她是那场实验唯一成功的样本。' },
    },
    goals: [
      { id: 'hide-truth', text: '别让学生查出十年前的实验', weight: 0.8, status: 'active', target: { layer: 2, x: 104, y: 24 } },
      { id: 'keep-shiori', text: '确认地下室的封印还完好', weight: 0.7, status: 'active', target: { layer: 0, x: 100, y: 40 } },
    ],
    needs: { safety: 600, status: 200, curiosity: 300 },
    attention: { 封印: 800, 实验: 700, 药: 600, 雨宫: 500 },
  },
  {
    id: 'kirisame-shiori',
    name: '雨宫 诗织',
    tint: '#e0b0ff',
    controller: 'sim',
    initiative: 99,
    pos: { layer: 0, x: 100, y: 40 },
    ability: { name: '空间转移', description: '把物体或自己瞬间移动到视线所及之处。', level: 5, charge: 90, state: '暴走', limit: '暴走时会带走附近的东西，包括人。' },
    persona: [
      '我不记得自己是怎么进来的。',
      '这间地下室的门，从里面看是反的。',
      '有人在叫我，用我小时候的名字。',
    ],
    facts: [
      e('shiori-lab', '地下室有一排空培养槽，只有一个还有水。', ['实验室', '培养槽']),
      e('shiori-chain', '墙上的锁链是我自己锁上的。', ['锁链', '地下室']),
      e('shiori-door', '地下室的门外，是十年前的走廊。', ['门', '走廊']),
    ],
    others: [
      e('shiori-genzo', '那个老人每晚会来门口站一会儿。', ['学园长']),
      e('shiori-transfer', '转校生的脚步声，我听过很多次。', ['转校生']),
    ],
    past: [
      e('shiori-ten', '十年前，他们叫我“第七号”。', ['实验', '往事']),
    ],
    secrets: [
      e('shiori-self', '我不是被关在这里，我是在等一个人回来。', ['等待', '秘密']),
    ],
    rumors: [
      e(INFO.bell, '钟声不是给外面听的，是给我听的。', ['钟声']),
      e(INFO.missing, '去年失踪的女孩，现在就在我隔壁。', ['失踪', '地下室']),
    ],
    creed: [
      e('creed-kirisame-shiori-0', '我不记得自己是谁，只记得门是反的。', ['自我']),
      e('creed-kirisame-shiori-1', '我在等一个人，他说过会回来。', ['自我', '转校生']),
      e('creed-kirisame-shiori-2', '钟声是给我的信号，不是报时。', ['钟声']),
      e('creed-kirisame-shiori-3', '地下室外面是十年前的走廊。', ['地下室']),
      e('creed-kirisame-shiori-4', '听到脚步声就躲到门后。', ['信条']),
      e('creed-kirisame-shiori-5', '除了那个脚步，谁都不信。', ['信条']),
    ],
    attitudes: {
      'kirisame-genzo': { stance: '敌意', text: '他把我关在这里十年。' },
      'kirisame-transfer': { stance: '亲近', text: '他会回来，他一直都会回来。' },
      'kirisame-todo': { stance: '畏惧', text: '她手上的味道，和当年一样。' },
    },
    goals: [
      { id: 'wait', text: '等到那个脚步声停下来', weight: 0.9, status: 'active', target: { layer: 0, x: 100, y: 40 } },
      { id: 'leave', text: '在钟声第二次响起前离开地下室', weight: 0.6, status: 'active', target: { layer: 1, x: 90, y: 37 } },
    ],
    needs: { safety: 800, status: 100, curiosity: 400 },
    attention: { 脚步: 900, 钟声: 800, 门: 700, 转校生: 600 },
  },
  {
    id: 'kirisame-inukai',
    name: '犬饲 武',
    tint: '#a8b58f',
    controller: 'sim',
    initiative: 35,
    pos: { layer: 1, x: 20, y: 68 },
    ability: { name: '嗅觉强化', description: '分辨极淡的气味，并追踪来源。', level: 1, charge: 10, state: '稳定', limit: '气味太浓时会短暂失能。' },
    persona: [
      '我在这院子里干了二十年，什么味道都闻过。',
      '今晚的土味不对，像从下面翻上来的。',
      '孩子们叫我犬饲先生，我不介意。',
    ],
    facts: [
      e('inukai-soil', '井边的土是新翻的，但没人承认。', ['井', '土']),
      e('inukai-burn', '后院有烧焦的草，火不是从上面来的。', ['后院', '火']),
      e('inukai-greenhouse', '温室的花今晚全朝着地下室弯。', ['温室', '花']),
    ],
    others: [
      e('inukai-moe', '绿川那孩子能听见植物，她最近很不安。', ['绿川']),
      e('inukai-ren', '会长来井边时，身上有地下室的土味。', ['会长', '井']),
    ],
    past: [
      e('inukai-old', '老爷还在的时候，后院有个地窖。', ['地窖', '往事']),
    ],
    secrets: [
      e('inukai-box', '井边的铁盒是我十年前埋的。', ['铁盒', '秘密']),
    ],
    rumors: [
      e(INFO.basement, '地下室的味道，从井里也能下去。', ['地下室', '井']),
      e(INFO.missing, '去年那孩子失踪前，来过井边。', ['失踪', '井']),
    ],
    creed: [
      e('creed-kirisame-inukai-0', '我闻得出谁在撒谎，但我不会说。', ['自我']),
      e('creed-kirisame-inukai-1', '井边的铁盒是我埋的，我欠老爷一个交代。', ['自我', '井']),
      e('creed-kirisame-inukai-2', '学校的土下面有管道，通向地下室。', ['地下室', '井']),
      e('creed-kirisame-inukai-3', '后院的焦土不是火，是能力留下的。', ['后院', '能力']),
      e('creed-kirisame-inukai-4', '守住井，别让人挖。', ['信条', '井']),
      e('creed-kirisame-inukai-5', '孩子们的事，能帮就帮。', ['信条']),
    ],
    attitudes: {
      'kirisame-moe': { stance: '亲近', text: '绿川像我的孙女，我得看着她。' },
      'kirisame-ren': { stance: '戒备', text: '会长在挖井边的东西。' },
      'kirisame-shiori': { stance: '畏惧', text: '地下室那位，不是活人的味道。' },
    },
    goals: [
      { id: 'watch-well', text: '守住井边，别让人挖铁盒', weight: 0.9, status: 'active', target: { layer: 1, x: 14, y: 56 } },
      { id: 'warn-moe', text: '让绿川今晚别去温室', weight: 0.5, status: 'active', target: { layer: 1, x: 13, y: 12 } },
    ],
    needs: { safety: 500, status: 100, curiosity: 300 },
    attention: { 井: 900, 铁盒: 800, 温室: 600, 后院: 500 },
  },
  {
    id: 'kirisame-rin',
    name: '九条 玲奈',
    tint: '#f2a6c8',
    controller: 'sim',
    initiative: 92,
    pos: { layer: 2, x: 106, y: 48 },
    ability: { name: '暗示', description: '用一句话让目标短时间相信或服从。', level: 4, charge: 55, state: '亢进', limit: '被识破后暗示会反噬自己。' },
    persona: [
      '我父亲是理事长，这所学校姓九条。',
      '能力不是用来打架的，是用来让人点头的。',
      '今晚谁点头，谁就能活到天亮。',
    ],
    facts: [
      e('rin-funds', '学生会的经费来自九条家，所以会长得听我的。', ['经费', '学生会']),
      e('rin-board', '理事会的会议室在二层东侧，今晚锁着。', ['理事会', '二层']),
      e('rin-storm', '暴风雨是人为的，为了困住所有人。', ['暴风雨', '人为']),
    ],
    others: [
      e('rin-hino', '火野是颗炸弹，留着比拆掉安全。', ['火野']),
      e('rin-genzo', '学园长只听父亲的话，不听我的。', ['学园长']),
    ],
    past: [
      e('rin-mother', '母亲也是能力者，她最后被“处理”了。', ['母亲', '往事']),
    ],
    secrets: [
      e('rin-plan', '我今晚要把所有能力者的名单带出去。', ['名单', '秘密']),
    ],
    rumors: [
      e(INFO.barrier, '结界不是保护我们，是防止我们出去。', ['结界']),
      e(INFO.basement, '地下室里的东西，是九条家养了十年的。', ['地下室', '九条']),
    ],
    creed: [
      e('creed-kirisame-rin-0', '我不是坏，我只是先一步看清了规则。', ['自我']),
      e('creed-kirisame-rin-1', '母亲被处理掉的那天，我就决定不再当好人。', ['自我', '往事']),
      e('creed-kirisame-rin-2', '学校是九条家的筛选场，学生只是数据。', ['学校', '阴谋']),
      e('creed-kirisame-rin-3', '结界是防我们出去，不是防东西进来。', ['结界']),
      e('creed-kirisame-rin-4', '能用话解决，就不用能力。', ['信条']),
      e('creed-kirisame-rin-5', '名单必须带出去，谁挡路就处理谁。', ['信条', '名单']),
    ],
    attitudes: {
      'kirisame-ren': { stance: '亲近', text: '会长好用，只要他不问太多。' },
      'kirisame-hino': { stance: '敌意', text: '火野不吃暗示，留着她碍事。' },
      'kirisame-genzo': { stance: '戒备', text: '他知道九条家太多事。' },
    },
    goals: [
      { id: 'take-list', text: '拿到学生会保险柜里的名单', weight: 0.9, status: 'active', target: { layer: 1, x: 87, y: 46 } },
      { id: 'quiet-hino', text: '让火野今晚闭嘴', weight: 0.6, status: 'active', target: { layer: 1, x: 100, y: 48 } },
    ],
    needs: { safety: 400, status: 700, curiosity: 500 },
    attention: { 名单: 900, 结界: 700, 火野: 600, 地下室: 500 },
  },
]

export const seedById = (id: string): CharacterSeed | undefined => SEEDS.find(seed => seed.id === id)
