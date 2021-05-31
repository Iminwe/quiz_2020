const Sequelize = require("sequelize");
const {models} = require("../models");

// Autoload el grupo asociado a :groupId
exports.load = async (req, res, next, groupId) => {

    try {
        const group = await models.Group.findByPk(groupId);
        if (group) {
            req.load = {...req.load, group};
            next();
        } else {
            throw new Error('There is no group with id=' + groupId);
        }
    } catch (error) {
        next(error);
    }
};

// GET /groups
exports.index = async (req, res, next) => {

    try {
        const groups = await models.Group.findAll();
        res.render('groups/index.ejs', {groups});
    } catch (error) {
        next(error);
    }
};

// GET /groups/new
exports.new = (req, res, next) => {

    const group = {name: ""};

    res.render('groups/new', {group});
};

// POST /groups/create
exports.create = async (req, res, next) => {

    const {name} = req.body;

    let group = models.Group.build({name});

    try {
        // Saves only the fields question and answer into the DDBB
        // group = await group.save({fields: ["name"]});
        // req.flash('success', 'Group created successfully.');
        // res.redirect('/groups/' + group.id);

        group = await group.save();
        req.flash('success', 'Group created successfully.');
        res.redirect('/groups');
    } catch (error) {
        if (error instanceof Sequelize.ValidationError) {
            req.flash('error', 'There are errors in the form:');
            error.errors.forEach(({message}) => req.flash('error', message));
            res.render('groups/new', {group});
        } else {
            req.flash('error', 'Error creating a new Group: ' + error.message);
            next(error);
        }
    }
};

// GET /groups/:groupId/edit
exports.edit = async (req, res, next) => {

    const {group} = req.load;
    const allQuizzes = await models.Quiz.findAll();
    const groupQuizzesIds = await group.getQuizzes().map(quiz => quiz.id);
    
    res.render('groups/edit', {group, allQuizzes, groupQuizzesIds});
};

// PUT /groups/:groupId
exports.update = async (req, res, next) => {

    const {group} = req.load;

    const {name, quizzesIds = []} = req.body;

    group.name = name.trim();

    try {
        await group.save({fields: ["name"]});
        await group.setQuizzes(quizzesIds);
        req.flash('success', 'Group edited successfully.');
        res.redirect('/groups');
    } catch (error) {
        if (error instanceof Sequelize.ValidationError) {
            req.flash('error', 'There are errors in the form:');
            error.errors.forEach(({message}) => req.flash('error', message));

            const allQuizzes = await models.Quiz.findAll();

            res.render('groups/edit', {group, allQuizzes, groupQuizzesIds: quizzesIds});
        } else {
            req.flash('error', 'Error editing the Group: ' + error.message);
            next(error);
        }
    }
};

// DELETE /groups/:groupId
exports.destroy = async (req, res, next) => {

    try {
        await req.load.group.destroy();
        req.flash('success', 'Group deleted successfully.');
        res.redirect('/goback');
    } catch (error) {
        req.flash('error', 'Error deleting the Group: ' + error.message);
        next(error);
    }
};

// GET /groups/:groupId/randomPlay 
exports.randomPlay = async (req, res, next) => {

    const group = req.load.group;

    req.session.groupPlay = req.session.groupPlay || {};

    // Si no existe lo crea y es equivalente a lo siguiente:
    // if (!req.session.groupPlay[group.id]){
    //     req.session.groupPlay[group.id] = {
    //         lastQuizId: 0,
    //         resolved: []
    //     };
    // }
    req.session.groupPlay[group.id] = req.session.groupPlay[group.id] || { lastQuizId: 0, resolved: [] };

    try {
        let quiz;
        // Volver a mostrar la misma pregunta que la última vez que se mostró y no se contestó
        if (req.session.groupPlay[group.id].lastQuizId) {
            quiz = await models.Quiz.findByPk(req.session.groupPlay[group.id].lastQuizId)
        } else {
            // Elegir una pregunta al azar no repetida
            // Aquí tengo que contar los quizzes que hay dentro del grupo
            const total = await group.countQuizzes();
            // Las que hay menos las que he resuelto
            const quedan = total - req.session.groupPlay[group.id].resolved.length;

            quiz = await models.Quiz.findOne({
                // Tiene que ser un quiz en el que su 'id' no esté ya resuelto
                where: { 'id': { [Sequelize.Op.notIn]: req.session.groupPlay[group.id].resolved } },
                include: [
                    {
                        model: models.Group,        // Los grupos a los que pertenece
                        as: "groups",
                        where: { id: group.id }     // Con el 'id' que a mi me interesa
                    }
                ],
                // Offset aleatorio
                offset: Math.floor(Math.random() * quedan)
            });
        }

        // 
        const score = req.session.groupPlay[group.id].resolved.length;

        if (quiz) {
            // El ultimo quizz encontrado
            req.session.groupPlay[group.id].lastQuizId = quiz.id;
            res.render('groups/random_play', { group, quiz, score });
        } else {
            delete req.session.groupPlay[group.id];
            res.render('groups/random_nomore', { group, score });
        }
    }
    catch (error) {
        next(error);
    }
};

// GET /groups/:groupId/randomCheck/:quizId/
exports.randomCheck = (req, res, next) => {

    // Recuperar grupo
    const group = req.load.group;

    //Recuperar la sesión para un grupo determinado
    req.session.groupPlay = req.session.groupPlay || {};
    req.session.groupPlay[group.id] = req.session.groupPlay[group.id] || { lastQuizId: 0, resolved: [] };

    //Si no existe la sesión para ese grupo, la creo
    // if (!req.session.groupPlay[group.id]) {
    //     req.session.groupPlay [group.id] = {
    //         lastQuizId: 0,
    //         resolved: []
    //     };
    // }

    const answer = req.query.answer || "";

    // Comprobar que answer == quiz answer
    const result = answer.toLowerCase().trim() === req.load.quiz.answer.toLowerCase().trim();

    if (result){
        req.session.groupPlay [group.id].lastQuizId = 0;
        
        // Evitar que me hagan llamadas a este metodo manualmente con una respuesta acertada para 
        // que se guarde muchas veces la misma respuesta en resolved, y asi conseguir que score
        // se incremente indebidamente
        if(req.session.groupPlay [group.id].resolved.indexOf(req.load.quiz.id) == -1){
            req.session.groupPlay [group.id].resolved.push(req.load.quiz.id);
        }        
    }
    
    const score = req.session.groupPlay [group.id].resolved.length;
    
    if (!result){
        delete req.session.groupPlay[group.id];
    }

    //Actualizar puntuación
    res.render('groups/random_result', {group, result, answer, score});
};

// GET /groups/scores
exports.scores = async (req, res, next) => {

    try {
        const groups = await models.Group.findAll();

        // // const score = req.session.groupPlay [group.id].resolved.length;
        // const scores = [];
        // groups.forEach(g => {
        //     scores[g.name]=req.session.groupPlay [g.id].resolved.length;
        //     //gScore = req.session.groupPlay [g.id].resolved.length;
        //     //scores.push(gScore);
        // });

        // console.log (groups);
        // console.log (scores);

        
        const scores = [];
        groups.forEach(g => {
            temp =[];
            console.log(g.name)
            temp.name = g.name;
            temp.score = req.session.groupPlay [g.id].resolved.length;
            scores.push(temp);

            // scores.push({name: g.name, score: req.session.groupPlay [g.id].resolved.length});
        });

        console.log (groups);
        console.log (scores);
        console.log (scores[0].name);
        console.log (scores[0].score);

        res.render('groups/scores.ejs', {scores});

    } catch (error) {
        next(error);
    }
    
};