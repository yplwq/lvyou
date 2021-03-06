const express = require("express")
// 数据库
const db = require('../modules/db')
// 上传组件
const upload = require('../modules/upload')
//创建一个路由对象。
var router = express.Router()

const fs = require('fs')
// 获取显示的页数，最多5页
function getPages(page, pageCount) {
    var pages = [page];
    var left = page - 1;
    var right = page + 1;
    // 左右两边各加1个页码,直到页码够5个或左边到1 右边到总页数
    while (pages.length < 5 && (left >= 1 || right <= pageCount)) {
        if (left > 0) pages.unshift(left--);
        if (right <= pageCount) pages.push(right++);
    }
    return pages;
}

// 管理员首页
router.get('/', (req, res) => {
    if (req.cookies.petname) {
        res.render('admin/admin', { petname: req.cookies.petname })
    } else {
        res.render('admin/login', { code: 'error', message: '请先登录' })
    }
})

// 管理员登录页面
router.get('/login', (req, res) => {
    res.render('admin/login')
})
// 处理管理员登录请求
router.post('/login', (req, res) => {
    db.User.find({ username: req.body.username }).count((err, count) => {
        if (err) {
            res.json({ code: 'error', message: '系统错误,请重试' })
        } else {
            if (count > 0) {
                db.User.findOne({ username: req.body.username }, (err, data) => {
                    // 判断是否为管理员
                    if (data.role == 'admin') {
                        if (req.body.password == data.password) {
                            // 设置cookie 15分钟
                            res.cookie('petname', data.petname, { maxAge: 900000 })
                            res.json({ code: 'success', message: '登录成功' })
                        } else {
                            res.json({ code: 'error', message: '密码错误,请重新输入' })
                        }
                    } else {
                        res.json({ code: 'error', message: '此用户不是管理员' })
                    }

                })
            } else {
                res.json({ code: 'error', message: '用户未注册,请注册' })
            }
        }
    })
})

// 管理员注销
router.get('/logout', (req, res) => {
    res.clearCookie('petname');
    res.render('admin/login')
})

// 用户列表
/*------------------------
/:page表示/后必须有字符
/(:page)?表示/后可以有字符，也可以没有字符
有字符串时可以通过page得到，没有字符时page是undefined
-------------------------*/
// 第一个参数(:page)表示页数
// 第二个参数(:pageSize)表示每页显示数
router.get('/users/(:page)?/(:pageSize)?', (req, res) => {
    var page = req.params.page;
    // page是undefined时，(page || 1)是1
    // page是数字时，(page || 1)是page
    page = page || 1;
    page = parseInt(page);
    var order = {};
    order['username'] = 1;
    var pageSize = req.params.pageSize;
    // 默认每页显示5条数据
    pageSize = pageSize || 5;
    pageSize = parseInt(pageSize);

    db.User.find().count((err, total) => {
        if (err) {
            console.log(err)
        } else {
            // 总页数，向上取整
            var pageCount = Math.ceil(total / pageSize);
            page = page > pageCount ? pageCount : page
            page = page < 1 ? 1 : page;

            // select对数据属性进行筛选，属性名之间用空格分隔
            db.User.find().sort(order).skip((page - 1) * pageSize).limit(pageSize).exec((err, data) => {
                res.render('admin/users', {
                    page, pageCount, pageSize, order, pages: getPages(page, pageCount),
                    users: data.map(m => {
                        m = m.toObject()
                        m.id = m._id.toString()
                        delete m._id
                        return m
                    })
                })
            })
        }
    })
})
router.post('/users/(:page)?/(:pageSize)?', (req, res) => {
    // filter 进行搜索的关键字
    var filter = {};
    var search = req.body.search;
    if (search) {
        search = search.trim();
        if (search.length > 0) {
            filter.username = {
                // 正则表达式
                // .表示除回车换行外的任意字符
                // *表示0个或多个
                // ?表示可以有也可以没有
                '$regex': `.*${search}.*?`
            }
        }
    }
    // 排序
    var order = {}
    // 向order中放入一对值,
    // 属性名是:req.body.sortProperty
    // 属性值是:req.body.sortDir
    order[req.body.sortProperty] = req.body.sortDir
    // 向页面发送当前的排序状态
    var dir = req.body.sortDir;

    var page = req.params.page;
    // page是undefined时，(page || 1)是1
    // page是数字时，(page || 1)是page
    page = page || 1;
    page = parseInt(page);

    var pageSize = req.params.pageSize;
    // 默认每页显示5条数据
    pageSize = pageSize || 5;
    if (pageSize == 'undefined') {
        pageSize = 5
    }
    pageSize = parseInt(pageSize);
    db.User.find(filter).count((err, total) => {
        if (err) {
            console.log(err)
        } else {
            // 总页数，向上取整
            var pageCount = Math.ceil(total / pageSize);
            page = page > pageCount ? pageCount : page
            page = page < 1 ? 1 : page;

            // select对数据属性进行筛选，属性名之间用空格分隔
            db.User.find(filter).sort(order).skip((page - 1) * pageSize).limit(pageSize).exec((err, data) => {
                res.render('admin/users', {
                    page, pageCount, pageSize, order, search, pages: getPages(page, pageCount),
                    users: data.map(m => {
                        m = m.toObject()
                        m.id = m._id.toString()
                        delete m._id
                        return m
                    })
                })
            })
        }
    })
})
// 添加用户
router.get('/user/add', (req, res) => {
    res.redirect('/admin/adduser.html')
})
router.post('/user/add', (req, res) => {
    new db.User(req.body).save(err => {
        if (err) {
            if (err.code == 11000) {
                res.json({ code: 'error', message: '用户名已存在' })
            } else {
                res.json({ code: 'error', message: '添加失败,系统出错' })
            }
        } else {
            res.json({ code: 'success', message: '添加成功' })
        }
    })
})
// 编辑用户
router.get('/user/edit/:id', (req, res) => {
    db.User.findById(req.params.id, (err, data) => {
        if (err) {

        } else {
            var user = data.toObject();
            user.id = data._id.toString()
            delete user._id
            res.render('admin/edituser', { user })
        }
    })
})
router.post('/user/edit/:id', (req, res) => {
    db.User.findByIdAndUpdate(req.params.id, req.body, err => {
        if (err) {
            res.json({ code: 'error', message: '系统错误' });
        }
        else {
            res.json({ code: 'success', message: '成功！' });
        }
    })
})
// 删除用户
router.get('/user/remove/:id', (req, res) => {
    // 通过用户名找到要删除的用户
    db.User.findByIdAndRemove(req.params.id, err => {
        if (err) {
            res.json({ code: 'error', message: '系统错误' });
        }
        else {
            res.json({ code: 'success', message: '成功！' });
        }
    })
})


// 首页管理
// 图片列表
router.get('/pic/list/:type', (req, res) => {
    var pics = new Array();
    db.Scenery.find((err, data) => {
        data.map(m => {
            m = m.toObject();
            if (m.picList) {
                for (var i = 0; i < m.picList.length; i++) {
                    pics.push(m.picList[i])
                }
            }
        })
        res.render('admin/pictures', { pics: pics, type: req.params.type })
    })
})

// banner管理
// banner列表
router.get('/banner', (req, res) => {
    db.Home.find({ type: 'banner' }, (err, data) => {
        res.render('admin/banner', { pics: data })
    })
})
// 添加banner和gallery,type为banner或gallery
router.post('/:type/add/:num', (req, res) => {
    var num = req.params.num
    db.Home.find({ type: req.params.type }).count((err, count) => {
        if (count >= parseInt(num)) {
            res.json({ code: 'error', message: '添加失败,最多添加'+ num +'张图片' })
        } else {
            new db.Home(req.body).save(err => {
                if (err) {
                    res.json({ code: 'error', message: '添加失败,系统出错' })
                } else {
                    res.json({ code: 'success', message: '添加成功' })
                }
            })
        }
    })
})
// 删除banner和gallery
router.post('/home/del/:id', (req, res) => {
    db.Home.findByIdAndRemove(req.params.id, (err, data) => {
        if (err) {
            res.json({ code: 'error', message: '删除失败,系统出错' })
        } else {
            res.json({ code: 'success', message: '删除成功' })
        }
    })
})
// gallery列表
router.get('/gallery', (req, res) => {
    db.Home.find({ type: 'gallery' }, (err, data) => {
        res.render('admin/gallery', { pics: data })
    })
})
// 导出路由
module.exports = router;