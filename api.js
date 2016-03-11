var express = require('express');
var status = require('http-status');
var bodyparser = require('body-parser');
var _ = require('underscore');

module.exports = function(wagner){
  var api = express.Router();

  api.use(bodyparser.json());

  api.get('/category/id/:id', wagner.invoke(function(Category){
    return function(req, res){
      Category.findOne({ _id: req.params.id },
        handleOne.bind(null, 'category', res));
    };
  }));

  api.get('/category/parent/:id', wagner.invoke(function(Category){
    return function(req, res){
      Category.
        find({ parent: req.params.id }).
        sort({ _id: 1 }).
        exec(handleMany.bind(null, 'categories', res));
    };
  }));

  api.get('/product/id/:id', wagner.invoke(function(Product){
    return function(req, res){
      Product.findOne({ _id: req.params.id },
        handleOne.bind(null, 'product', res));
    };
  }));

  api.get('/product/category/:id', wagner.invoke(function(Product){
    return function(req, res){
      var sort = { name: 1 };
      if(req.query.price == "1"){
        sort = { "internal.approximatePriceUSD": 1 };
      }
      else if(req.query.price == "-1"){
        sort = { "internal.approximatePriceUSD": -1 };
      }
      Product.
        find({ "category.ancestors": req.params.id }).
        sort(sort).
        exec(handleMany.bind(null, 'products', res));
    };
  }));

  api.put('/me/cart', wagner.invoke(function(User){
    return function(req, res){
      try{
        var cart = req.body.data.cart;
      } catch(e) {
        return res.
          status(status.BAD_REQUEST).
          json({ error: 'No cart provided'});
      }

      req.user.data.cart = cart;
      req.user.save(function(error, user){
        if(error){
          return res.
            status(status.INTERNAL_SERVER_ERROR).
            json({ error: error.toString() });
        }
        res.json({ user: user });
      });
    };
  }));

  api.get('/me', wagner.invoke(function(User){
    return function(req, res){
      if(!req.user){
        return res.
          status(status.UNAUTHORIZED).
          json({ error: 'Not logged in'});
      }

      req.user.populate(
        { path: 'data.cart.product', model: 'Product' },
        handleOne.bind(null, 'user', res));
    };
  }));

  api.post('/checkout', wagner.invoke(function(User, Stripe){
    return function(req, res){
      if(!req.user){
        return res.
          status(status.UNAUTHORIZED).
          json({ error: 'Not logged in' });
      }

      // Populate the products in the user's cart
      req.user.populate({ path: 'data.cart.product', model: 'Product'}, function(error, user){
        var totalUSD = 0;
        // Sum up total user's cart price in USD
        _.each(user.data.cart, function(item){
          totalUSD += item.product.internal.approximatePriceUSD * item.quantity;
        });

        // Charge with Stripe
        Stripe.charges.create(
          {
            amount: Math.ceil(totalUSD * 100),
            currency: 'usd',
            source: req.body.stripeToken,
            description: 'Example charge'
          },
          function(err, charge){
            if (err && err.type === 'StripeCardError') {
              return res.
                status(status.BAD_REQUEST).
                json({ error: err.toString() });
            }
            if(err){
              console.log(err);
              return res.
                status(status.INTERNAL_SERVER_ERROR).
                json({ error: err.toString() });
            }

            req.user.data.cart = [];
            req.user.save(function(){
              // If successfull, return the charge id
              return res.json({ id: charge.id });
          });
        });
      });
    };
  }));

  return api;
};

handleOne = function(property, res, error, doc){
  if(error){
    return res.
      status(status.INTERNAL_SERVER_ERROR).
      json({ error: error.toString() });
  }
  if(!doc){
    return res.
      status(status.NOT_FOUND).
      json({ error: 'Not found'});
  }

  var json = {};
  json[property] = doc;
  res.json(json);
};

handleMany = function(property, res, error, doc){
  if(error){
    return res.
      status(status.INTERNAL_SERVER_ERROR).
      json({ error: error.toString() });
  }

  var json = {};
  json[property] = doc;
  res.json(json);
};