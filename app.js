//基于cqhttp的qq机器人
// 待修改 源消息发送资源回收，实例化问题
// 待实现 用户权限列表迁移至数据库 超级管理员权限实现
const express = require('express');
const axios = require('axios');
const mysql = require('mysql');
const botUrl = 'http://127.0.0.1:5700';
let objList = { group: [], private: [] };
const groups = [];
const qqs = [];
const adminGroup = [];
const adminQQ = [];


//QQ号和QQ群的模型
class objModel {
    constructor(id, sendType) {
        this.id = id;
        this.onlineEmojiTimer = null;
        this.remindMeTimer = null;
        this.sendType = sendType;
        this.sourceMsgTimer = null;
    }
}

// console.log(objList['groupslist'][0].id);
let pool = mysql.createPool({
    connectionLimit: 5,
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '8e99d58fefefa0be',
    database: 'qqbot'
});

let server = express();
server.listen(8082);

server.use(express.json()); //cqhttp反向http请求为json

//初始化后才能执行发送定时器和请求
initObjList().then(()=>{
    // console.log(objList);
    sourceMsg(6);//不定时发送源消息
    server.post('/', (req, res) => {
        // console.log('上报:' + UpDataState(req.body));
        UpDataState(req.body);
        res.send();
    });
});

function UpDataState(data) {
    //判断上报类型
    switch (data.post_type) {
        case 'message':
            // return '(message)' + receiveMsg(data);
            console.log('(message)' + receiveMsg(data));
            break;
        case 'request':
            console.log('(request)');
            break;
        case 'notice':
            console.log('(notice)');
            break;
        // case 'meta_event':
        //     return '(meta_event)';
        // default:
        //     return '无法解析的上报';
    }
}

function receiveMsg(data) {
    //判断消息类型 自己发送的消息不处理
    if (data.message[0].type != 'text') return '非文字内容暂不处理';
    if (data.self_id == data.message_id) return '机器人发送的消息，不予处理';
    if (data.message_type == 'group') return receiveGroupMsg(data);
    if (data.message_type == 'private') return receivePrivateMsg(data);
    return '未知的消息风格[message_type unknow]';
}

function receiveGroupMsg(data) {
    //判断是否为vip群的消息
    let isVip = false;
    for (let i = 0; i < groups.length; i++) {
        if (groups[i].toString() == data.group_id.toString()) {
            isVip = true;
        }
    }
    if (isVip) vipGroupMsg(data.group_id, data.message[0].data.text);
    return `有群消息:(${data.group_id})${data.message[0].data.text}`;
}

function receivePrivateMsg(data) {
    //判断是否为vip QQ号（此处逻辑与vip群不同，为了发送无权限提示所以需要同步判断）
    let isVip = false;
    for (let i = 0; i < qqs.length; i++) {
        if (qqs[i].toString() == data.user_id.toString()) {
            isVip = true;
        }
    }
    if (isVip) vipQQMsg(data.user_id, data.message[0].data.text);
    else noPermissionMsg(data.user_id, 'private');
    return `有QQ私聊消息:(${data.user_id})${data.message[0].data.text}`;
}

function noPermissionMsg(receiver, type) {
    //无权限执行
    sendMsg(type, receiver, '对不起，主人不让我和不认识的人讲话。');
}

function vipGroupMsg(group, receive) {
    sendCommonMsg(group, receive, 'group');
};

function vipQQMsg(qq, receive) {
    sendCommonMsg(qq, receive, 'private');
}

function sendCommonMsg(receiver, receive, type) {
    //发送通用消息
    // receiver 要发送消息的接收者（qq群号或qq号）
    // receive  机器人接收到消息（String）
    // type     类型 group private
    if (receive == '请DD帮助我一下') {
        helpTalk(receiver, receive, type);
    // } 
    // else if(/疫情信息$/.test(receive)){
    //     sendCOVID19Msg(receiver, receive, type);
    // 接口作废
    }else if ( /搞黄色$/.test(receive)){
        sendSETUMsg(receiver, receive, type);
    } else if (receive == '测试一下') {
        //测试消息
        sendVoiceMsg(type, receiver, '欸呀呀呀，你要试试我的哪里呢？');
    } else if (/^DD添加对话：/.test(receive)) {
        //添加对话功能
        addTalk(receive, receiver, type);
    } else if (receive == 'DD唱首歌') {
        sendVoiceMsg(type, receiver, '哎咿呀咦哟，嘿嘿');
        axios.get(encodeURI('https://api.uomg.com/api/rand.music?sort=热歌榜&format=json')).then(res => {
            sendMsg(type, receiver, res.data.data.url);
        });
    } else if (receive == '动漫图片') {
        //动漫图片功能
        axios.get('https://www.dmoe.cc/random.php?return=json').then(res => {
            sendTextMsg(type, receiver, `[CQ:image,file=anime.jpg,url=${res.data.imgurl}]`);
        });
    } else if (receive == '天气') {
        //天气功能
        axios.get('https://api.seniverse.com/v3/weather/now.json?key=SCYrvkytJze9qyzOh&location=beijing&language=zh-Hans&unit=c').then(res => {
            sendMsg(type, receiver, `目前${res.data.results[0].location.name}天气：${res.data.results[0].now.temperature}摄氏度 ${res.data.results[0].now.text}`);
        });
    } else if (/^百度百科：/.test(receive)) {
        //百度百科功能
        baike(receive, receiver, type);
    } else if (receive == 'DD开始在线卖萌') {
        //timer功能测试
        cute(receive, receiver, type);
    } else if (/分钟后提醒我$/.test(receive)) {
        //定时提醒功能
        remindTimer(receive, receiver, type);
    } else if (receive == '停下来') {
        //timer停止 所有timer停止都写在这
        stopCuteTimer(receive, receiver, type);
    } else if (receive == 'DD转换模式') {
        //发送模式转换
        sendTypeChange(receive, receiver, type);
    } else {
        //数据库对话调用 先进行对话分词 取正确率最高的词
        /* 没事别写递归，真几把恶习 */
        fromSQLSelect(receive, receiver, type);
    }
}

function sendMsg(type, receiver, message) {
    for (let i = 0; i < objList[type].length; i++) {
        if (objList[type][i].id == receiver) {
            // console.log(objList[i][type]);
            if (objList[type][i].sendType == 'text') sendTextMsg(type, receiver, message);
            if (objList[type][i].sendType == 'tts') {
                // console.log(message.length > 3);
                if (message.length > 3) sendVoiceMsg(type, receiver, message);
                else sendTextMsg(type, receiver, message);
            }
        }
    }
}

function sendTextMsg(type, receiver, message) {
    axios.post(botUrl + '/send_msg', { message_type: type, user_id: receiver, group_id: receiver, message: message });
}

function sendVoiceMsg(type, receiver, message) {
    axios.post(botUrl + '/send_msg', { message_type: type, user_id: receiver, group_id: receiver, message: `[CQ:tts,text=${message}]` });
}

function objIndex(receiver, type) {
    //找聊天对象在大对象的位置
    let index = 0;
    for (let j = 0; j < objList[type][j].length; j++) {
        if (objList[type][j].id == receiver) {
            objIndex = j;
        }
    }
    return index;
}

function isAdmin(type, receiver) {
    // type     类型 group private
    // console.log(type,adminGroup,adminQQ);
    if (type == 'group') {
        for (let i = 0; i < adminGroup.length; i++) {
            if (receiver == adminGroup[i]) return true;
        }
    }
    if (type == 'private') {
        for (let i = 0; i < adminQQ.length; i++) {
            if (receiver == adminQQ[i]) return true;
        }
    }
    return false;
}

//递归查群arr数组中每个词
function sqlQueryTalk(arr, receive, receiver, type, arrIndex) {
    // console.log(arr);
    if (arrIndex < 0) {
        return;
    };
    let maxT = arr[arrIndex].t;
    //修改结果
    let removeChars = ['的', '地', '得', '了', '啊'];
    for (let j = 0; j < removeChars.length; j++) {
        maxT = maxT.replace(removeChars[j], '');
    }
    //数据库查询正确率最高的词
    if (maxT.trim() == '' && type == 'group') return; //群里先不用空字符查询
    let sql = 'SELECT * FROM public_talk WHERE receive = ?';
    // console.log(maxT);
    pool.query(sql, [maxT], (err, result) => {
        if (err) throw err;
        //随机输出查询结果的一个
        // console.log('arrIndex：' + arrIndex, 'maxT:' + maxT);
        if (!result.length) {
            sqlQueryTalk(arr, receive, receiver, type, arrIndex - 1);
            return;
        }
        sendMsg(type, receiver, result[Math.floor(Math.random() * result.length)].send);
    });
}

function compare(key) {
    return function (value1, value2) {
        var val1 = value1[key];
        var val2 = value2[key];
        return val1 - val2;
    }
}

function allCharQueery(receive, receiver, type) {
    //整句查询
    return new Promise(function (resolve, reject) {
        pool.query("SELECT * FROM public_talk WHERE receive=?", [receive], (err, result) => {
            if (err) throw err;
            // console.log(result);
            if (result.length <= 0) {
                resolve();
                return;
            }
            sendMsg(type, receiver, result[Math.floor(Math.random() * result.length)].send);
        });
    });
}

function remindTimer(receive, receiver, type) {
    //提示计时器功能
    if (objList[type][objIndex(receiver, type)].remindMeTimer != null) {
        sendMsg(type, receiver, '对不起哦，我已经在记时了~');
        return;
    }
    let min = receive.replace("分钟后提醒我", '');
    min = parseFloat(min);
    // console.log(min, typeof min);
    if (!isNaN(min) && min < (Number.MAX_VALUE / 60 / 1000)) {
        sendMsg(type, receiver, '收到!Master');
        let millisecond = parseInt(min * 60 * 1000);
        objList[type][objIndex(receiver, type)].remindMeTimer = setTimeout(() => {
            sendMsg(type, receiver, '时间到了啦！');
            objList[type][objIndex(receiver, type)].remindMeTimer = null;
        }, millisecond);
    } else {
        sendMsg(type, receiver, '请输入数字格式的时间哦');
    }
    // console.log('提醒');

}

function stopCuteTimer(receive, receiver, type) {
    //Cute停止功能
    if (objList[type][objIndex(receiver, type)].onlineEmojiTimer != null) {
        clearInterval(objList[type][objIndex(receiver, type)].onlineEmojiTimer);
        objList[type][objIndex(receiver, type)].onlineEmojiTimer = null;
    }
}

function fromSQLSelect(receive, receiver, type) {
    //数据库搜索功能
    axios.get(encodeURI(`http://api.pullword.com/get.php?source=${receive}&param1=0&param2=1&json=1`)).then((res => {
        let arr = res.data;
        arr.sort(compare('p'));
        allCharQueery(receive, receiver, type).then(function () {
            sqlQueryTalk(arr, receive, receiver, type, arr.length - 1);
        }); //先查询整句  
    }));
}

function cute(receive, receiver, type) {
    let emojis = ['w(ﾟДﾟ)w', '(ノへ￣、)', '(￣_,￣ )', 'ヽ(✿ﾟ▽ﾟ)ノ', '(๑•̀ㅂ•́)و✧', '(￣ε(#￣)☆╰╮o(￣皿￣///)', '（づ￣3￣）づ╭❤～', 'Σ( ° △ °|||)︴', ' (～￣(OO)￣)ブ', '凸(艹皿艹 )', '(* ￣3)(ε￣ *)', '(*￣rǒ￣)', '︿(￣︶￣)︿'];
    let i = 0;
    //objList 大对象 type 消息类型 objIndex 群号或者qq号对应的位置
    if (objList[type][objIndex(receiver, type)].onlineEmojiTimer == null) {
        objList[type][objIndex(receiver, type)].onlineEmojiTimer = setInterval(() => {
            sendMsg(type, receiver, emojis[i]);
            i++;
            if (i >= emojis.length) {
                clearInterval();
                objList[type][objIndex(receiver, type)].onlineEmojiTimer = null;
            }
        }, 2000);
    }
}

function baike(receive, receiver, type) {
    //百度百科功能
    axios.get(encodeURI(`https://baike.baidu.com/api/openapi/BaikeLemmaCardApi?appid=379020&bk_key=${receive.replace(/百度百科：/, '')}`)).then(res => {
        if (JSON.stringify(res.data) != '{}') {
            sendMsg(type, receiver, `${res.data.title}:\n${res.data.abstract}\n\n${res.data.url}`);
        } else {
            sendMsg(type, receiver, `对不起，百度不到（＝。＝）`);
        }
    });
}

function addTalk(receive, receiver, type) {
    // console.log(type,adminGroup,adminQQ);
    if (isAdmin(type, receiver)) {
        let str = receive.replace("DD添加对话：", '');
        pool.query('INSERT INTO `public_talk` (`id`, `receive`, `send`) VALUES (NULL, ?, ?)', [str.substr(0, str.indexOf('///')), str.substr(str.indexOf('///') + 3)], (err, result) => {
            if (err) throw err;
        });
    } else {
        sendMsg(type, receiver, '此功能需要经过主人同意才可以用哦');
    }
}

function helpTalk(receiver, receive, type) {
    let str1 = `帮助：
    输入 DD添加对话：(输入对话)///(回复对话) 来添加新的对话（需要管理员权限）,输入 DD唱首歌 会被打扰,输入 动漫图片 来获取动漫图片`
     let str2 = `输入 天气 来获取天气信息,输入 百度百科：(搜索内容) 来百度,输入 DD开始在线卖萌 emmmm你可能需要输入 停下来 来停下它,输入 (数字)分钟后提醒我 来定时提醒。`
    sendTextMsg(type, receiver, str1);
    sendTextMsg(type, receiver, str2);
}

function sendTypeChange(receive, receiver, type) {
    for (let i = 0; i < objList[type].length; i++) {
        if (objList[type][i].id == receiver) {
            if (objList[type][i].sendType == 'text') {
                objList[type][i].sendType = 'tts';
                pool.query('UPDATE receiver SET send_type = ? WHERE receiver_id = ?',['tts',receiver],(err,result)=>{
                    if(err) throw err;
                    sendMsg(type, receiver, '已转换为语音模式');
                });
                return;
            }
            if (objList[type][i].sendType == 'tts') {
                objList[type][i].sendType = 'text';
                pool.query('UPDATE receiver SET send_type = ? WHERE receiver_id = ?',['text',receiver],(err,result)=>{
                    if(err) throw err;
                    sendMsg(type, receiver, '已转换为文字模式');
                });
                return;
            }

        }
    }
}

function sourceMsg(hour) {
    //又他妈是递归，不过这个没那么恶心
    // 单位小时
    let randomMax = 1000 * 60 * 60 * hour;
    let timerMillisecond = parseInt(randomMax * Math.random());
    // console.log(timerMillisecond);
    setTimeout(() => {
        pool.query('select count(*) from source_talk', ((err, result) => {
            if (err) throw err;
            pool.query('select * from source_talk ORDER BY id desc LIMIT ?,1', [Math.floor(result[0]['count(*)'] * Math.random())], function (error, dataResult) {
                if (err) throw err;
                console.log(Math.floor(Math.random() * adminGroup.length));
                let groupId = adminGroup[Math.floor(Math.random() * adminGroup.length)];
                sendMsg('group', groupId, dataResult[0].send);
                sourceMsg(hour);
            });
        }));
    }, timerMillisecond);

}

function initObjList() {
    //初始化实例
    return new Promise((resolve, reject) => {
        pool.query('SELECT * FROM receiver', (err, result) => {
            if (err) throw err;
            for (let i = 0; i < result.length; i++) {
                switch (result[i].type) {
                    case 'group':
                        if (result[i].permission == 'admin') adminGroup.push(result[i].receiver_id);
                        groups.push(result[i].receiver_id);
                        objList.group.push(new objModel(result[i].receiver_id, result[i].send_type));
                        break;
                    case 'private':
                        if (result[i].permission == 'admin') adminQQ.push(result[i].receiver_id);
                        qqs.push(result[i].receiver_id);
                        objList.private.push(new objModel(result[i].receiver_id, result[i].send_type));
                        break;
                }
            }
            // console.log(objList,adminGroup,adminQQ);
            resolve();
        });



    });
    // function initarr() {
    //     //创建群实例和qq号实例，数据分开管理

    //     for (let i = 0; i < groups.length; i++) {
    //         objList.group.push(new objModel(groups[i],sendType));
    //     }

    //     for (let i = 0; i < qqs.length; i++) {
    //         objList.private.push(new objModel(qqs[i],sendType));
    //     }
    // }
}

function sendSETUMsg(receiver, receive, type){
    let str=receive.replace('搞黄色','');
    axios.get(encodeURI(`https://api.lolicon.app/setu/v2?r18=2&keyword=${str}`)).then(res=>{
        if(res.data.data.length == 0 ){
            sendMsg(type,receiver,'哎，没找到啊！');
            return;
        }
        sendTextMsg(type, receiver,`[CQ:image,file=anime.jpg,url=${res.data.data[0].urls.original}]`);
    },err=>{
        console.log(err)
    });
}

function sendCOVID19Msg(receiver, receive, type){
    let city='';
    city=receive.replace('疫情信息','');
    sendTextMsg(type,receiver,encodeURI(`http://123.57.77.225:8080/yq?city=${city}`));
//     axios.get('https://api.inews.qq.com/newsqa/v1/query/inner/publish/modules/list?modules=statisGradeCityDetail,diseaseh5Shelf').then(res=>{
//         if(res.data.ret!=0) return;
//         let msgList = res.data.data.statisGradeCityDetail;
//         let msg = city+'新冠疫情情况：';
//         let cityIndex = [];
//         for(let i=0;i<msgList.length;i++){
//             if(msgList[i].province == city){
//                 cityIndex.push(i);
//             }
//         }
//         if(cityIndex == []){
//             sendMsg(type,receiver,'未找到该城市信息');
//             return;
//         }
//         for(let i = 0;i<cityIndex.length;i++){
//             msg+=`\n城市地区：${msgList[cityIndex[i]].province} ${msgList[cityIndex[i]].city}
// 现有确认：${msgList[cityIndex[i]].nowConfirm}例
// 治愈：${msgList[cityIndex[i]].heal}例
// 新增确诊：${msgList[cityIndex[i]].confirmAdd}例
// 累计确诊：${msgList[cityIndex[i]].confirm}例
// 死亡：${msgList[cityIndex[i]].dead}例\n`;
//         }
//         sendMsg(type,receiver,msg);     
//     });
}
/*以下内容为管理接口*/
// server.post('/set',(req,res)=>{
    
// });

/*附加接口*/
